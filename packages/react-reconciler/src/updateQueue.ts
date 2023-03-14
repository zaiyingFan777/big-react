import { Dispatch } from 'react/src/currentDispatcher';
import { Action } from 'shared/ReactTypes';
import { Lane, NoLane, isSubsetOfLanes } from './fiberLanes';

// 更新
// action
// this.setState({xx: 1})
// this.setState(({xx: 1}) => {xx: 2})
export interface Update<State> {
	action: Action<State>;
	lane: Lane;
	next: Update<any> | null;
}

// 创建更新
export const createUpdate = <State>(
	action: Action<State>,
	lane: Lane
): Update<State> => {
	return {
		action,
		lane,
		next: null
	};
};

// updateQueue
export interface UpdateQueue<State> {
	shared: {
		pending: Update<State> | null;
	};
	// 为了兼容hook
	dispatch: Dispatch<State> | null;
}

// 实例化updateQueue的方法
export const createUpdateQueue = <State>() => {
	return {
		shared: {
			pending: null
		},
		dispatch: null
	} as UpdateQueue<State>;
};

// 往UpdateQueue里面增加Update
// updateQueue.shared.pending指向环状链表的最后一个
// updateQueue.shared.pending.next指向环状链表的第一个
export const enqueueUpdate = <State>(
	updateQueue: UpdateQueue<State>,
	update: Update<State>
) => {
	// 直接覆盖: 最初的实现
	// updateQueue.shared.pending = update;
	// 变为环形链表结构
	const pending = updateQueue.shared.pending;
	if (pending === null) {
		// 当前的updateQueue中还没有插入update
		// 比如第一次传进来a，a.next -> a，然后updateQueue.shared.pending赋值为a，说明，pending指向了a，a又指向自己，说明形成了一个环状列表
		// pending = a -> a，pending指向的这条链表中最后插入的update
		update.next = update;
	} else {
		// 已经存在update
		// b.next -> a.next(a)
		update.next = pending.next;
		// a.next -> b
		pending.next = update;
	}
	// 让pending指向b，pending = b.next -> a a.next -> b (b -> a -> b)
	updateQueue.shared.pending = update;
	// ps: 假设又插入c，c.next -> [pending(b).next](a) (c->a)，pending(b).next -> c (b->c) ,然后 a-> b 推出 c -> a -> b -> c
};

// updateQueue消费update的方法
// 返回值全新的状态
export const processUpdateQueue = <State>(
	baseState: State, // 初始的状态
	pendingUpdate: Update<State> | null, // 要消费的状态, baseQueue与原来的pendingUpdate合并后的结果
	renderLane: Lane
): {
	memoizedState: State;
	baseState: State;
	baseQueue: Update<State> | null;
} => {
	const result: ReturnType<typeof processUpdateQueue<State>> = {
		memoizedState: baseState,
		baseState,
		baseQueue: null
	};

	if (pendingUpdate !== null) {
		// 第一个update
		// 找到更新环状链表中的第一个Lane(最先插入环状链表的)
		const first = pendingUpdate.next;
		let pending = pendingUpdate.next as Update<any>;

		// newBaseState为baseState的最新值
		let newBaseState = baseState; // 最后一个没有被跳过的state值
		// 用链表保存baseQueue
		let newBaseQueueFirst: Update<State> | null = null;
		let newBaseQueueLast: Update<State> | null = null;
		// 每次计算的结果会被赋值给memoizedState
		let newState = baseState; // 每次计算的最新值

		// 计算baseState，环状链表从第一个开始计算计算到结尾
		do {
			// 拿到update中的Lane
			const updateLane = pending.lane;
			// 我们比较优先级，并不是 「lane数值大小的直接比较」，而是判断是否有交集
			// 所以 syncLane 虽然比 DefaultLane 优先级高， 但我们并不是直接比较他两， 而是将他两和我们本次更新的 优先级进行比较
			if (!isSubsetOfLanes(renderLane, updateLane)) {
				// 优先级不够，被跳过
				const clone = createUpdate(pending.action, pending.lane);
				// 需要判断这个跳过的update是不是第一个被跳过的
				if (newBaseQueueFirst === null) {
					// 第一个被跳过的
					// first u0 last u0
					newBaseQueueFirst = clone;
					newBaseQueueLast = clone;
					// newState已经计算出来的当前的状态,因为这是第一个被跳过的，接下来newBaseState就不会再变了
					newBaseState = newState;
				} else {
					// 不是第一个被跳过的
					// first u0
					// last u0 -> u1
					// first u0 -> u1
					// last u1
					// 再来个u2
					// u1 -> u2(first u0->u1->u2)
					// last u2
					(newBaseQueueLast as Update<State>).next = clone;
					newBaseQueueLast = clone;
				}
			} else {
				// 优先级足够
				if (newBaseQueueLast !== null) {
					// 查看之前有没有被跳过的Update,如果之前有被跳过的，那么被跳过的update及后面的所有Update都会被保存在baseQueue中参与下次state计算
					// 当前优先级会被降低为NoLane，任何优先级 & NoLane都为NoLane，isSubsetOfLanes计算结果为true
					const clone = createUpdate(pending.action, NoLane);
					newBaseQueueLast.next = clone;
					newBaseQueueLast = clone;
				}

				// 执行计算
				const action = pendingUpdate.action;
				if (action instanceof Function) {
					// baseState 1，update (x) => 4x 得到 -> memoizedState 1*4=4
					newState = action(baseState);
				} else {
					// baseState 1，update 2 得到 -> memoizedState 2
					newState = action;
				}
			}
			pending = pending?.next as Update<any>;
		} while (pending !== first);

		if (newBaseQueueLast === null) {
			// 本次计算没有Update被跳过
			// baseState === memoizedState
			newBaseState = newState;
		} else {
			// 本次计算有Update被跳过
			// 将newBaseQueueLast与newBaseQueueFirst构成环状链表
			newBaseQueueLast.next = newBaseQueueFirst;
		}
		result.memoizedState = newState;
		result.baseState = newBaseState;
		result.baseQueue = newBaseQueueLast;
	}
	return result;
};
