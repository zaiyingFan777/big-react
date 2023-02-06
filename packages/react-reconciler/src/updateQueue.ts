import { Dispatch } from 'react/src/currentDispatcher';
import { Action } from 'shared/ReactTypes';
import { Lane } from './fiberLanes';

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
	pendingUpdate: Update<State> | null, // 要消费的状态
	renderLane: Lane
): { memoizedState: State } => {
	const result: ReturnType<typeof processUpdateQueue<State>> = {
		memoizedState: baseState
	};

	if (pendingUpdate !== null) {
		// 第一个update
		// 找到更新环状链表中的第一个Lane(最先插入环状链表的)
		const first = pendingUpdate.next;
		let pending = pendingUpdate.next as Update<any>;
		// 计算baseState，环状链表从第一个开始计算计算到结尾
		do {
			// 拿到update中的Lane
			const updateLane = pending.lane;
			if (updateLane === renderLane) {
				// 执行计算
				const action = pendingUpdate.action;
				if (action instanceof Function) {
					// baseState 1，update (x) => 4x 得到 -> memoizedState 1*4=4
					baseState = action(baseState);
				} else {
					// baseState 1，update 2 得到 -> memoizedState 2
					baseState = action;
				}
			} else {
				if (__DEV__) {
					console.error('不应该进入updateLane !== renderLane逻辑');
				}
			}
			pending = pending?.next as Update<any>;
		} while (pending !== first);
	}
	result.memoizedState = baseState;
	return result;
};
