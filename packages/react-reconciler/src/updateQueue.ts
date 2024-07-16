import { Dispatch } from 'react/src/currentDispatcher';
import { Action } from 'shared/ReactTypes';
import { isSubsetOfLanes, Lane, mergeLanes, NoLane } from './fiberLanes';
import { FiberNode } from './fiber';

// update数据结构Type
// this.setState({xx:1})
// this.setState(({xx:1}) => ({xx:2}))
export interface Update<State> {
	action: Action<State>;
	lane: Lane;
	next: Update<any> | null;
	// 新加的值，第一次进来的update计算后的结果eagerState，后续再计算可以基于eagerState
	hasEagerState: boolean;
	eagerState: State | null;
}

// 创建Update实例的方法
export const createUpdate = <State>(
	action: Action<State>,
	lane: Lane,
	hasEagerState = false,
	eagerState = null
): Update<State> => {
	return {
		action,
		lane,
		next: null,
		hasEagerState,
		eagerState
	};
};

// 定义UpdateQueue
export interface UpdateQueue<State> {
	shared: {
		pending: Update<State> | null;
	};
	// 兼容Hooks
	dispatch: Dispatch<State> | null;
}

// 初始化UpdateQueue实例的方法
export const createUpdateQueue = <State>(): UpdateQueue<State> => {
	return {
		shared: {
			pending: null
		},
		dispatch: null
	} as UpdateQueue<State>;
};

// 向UpdateQueue中添加Update
export const enqueueUpdate = <State>(
	updateQueue: UpdateQueue<State>,
	update: Update<State>,
	fiber: FiberNode,
	lane: Lane
) => {
	// 覆盖操作
	// updateQueue.shared.pending = update;
	// 批处理 比如：一个点击事件有多个setState((count) => count + 1)，这种情况，将update变为环形链表
	const pending = updateQueue.shared.pending;
	if (pending === null) {
		// 当前没有update，自己指向自己(环形链表)
		// 进来update a ，然后形成环形链表a.next->a
		// pending: a->a
		update.next = update;
	} else {
		// 当前有update
		// pending: a->a
		// 插入b，b.next -> a.next(a)
		update.next = pending.next;
		// a.next -> update(b)
		pending.next = update;
		// 下面updateQueue.shared.pending = update; 就是pending -> b ，最终的结果：pending = b -> a -> b
		// !!!pending始终指向最后插入的update

		// 又插入c
		// c.next -> b.next
		// b.next -> c
		// 最终：pending = c -> a(b.next) -> b -> c
	}
	// 将update赋值给updateQueue.shared.pending
	// !!!pending始终指向最后插入的update
	// pending.next指向第一个插入的
	updateQueue.shared.pending = update;

	// 将本次更新的lane合并到fiber的lanes上
	fiber.lanes = mergeLanes(fiber.lanes, lane);
	// !!!找到current，给current的lanes字段也添加上lane。
	// 因为消费Update是wip的update，防止出现问题的时候，wip需要重建 我们到时候可以从current中恢复
	const alternate = fiber.alternate;
	if (alternate !== null) {
		alternate.lanes = mergeLanes(alternate.lanes, lane);
	}
};

export function basicStateReducer<State>(state: State, action: Action<State>) {
	if (action instanceof Function) {
		// baseState 1 update (x) => 4x -> memoizedState 1*4 = 4
		// newState = action(baseState);
		return action(state);
	} else {
		// baseState 1 update 2 -> memoizedState 2
		// newState = action;
		return action;
	}
}

// 消费UpdateQueue中的Update的方法
export const processUpdateQueue = <State>(
	baseState: State, // 初始的状态
	pendingUpdate: Update<State> | null, // 要被消费的状态，应该为baseQueue以及原来的pendingUpdate合并的结果
	renderLane: Lane,
	onSkipUpdate?: <State>(update: Update<State>) => void // 当我们有Update因为优先级不够被跳过 这个函数就会执行
): {
	memoizedState: State; // memoizedState 是上次更新计算的最终 state
	baseState: State; // baseState 是本次更新参与计算的初始 state(最后一个没被跳过的 update 计算后的结果)
	baseQueue: Update<State> | null; // 保存：被跳过的update以及后面的所有update
} => {
	const result: ReturnType<typeof processUpdateQueue<State>> = {
		memoizedState: baseState,
		baseState,
		baseQueue: null
	};
	// pending: c a b c

	if (pendingUpdate !== null) {
		// pendingUpdate为环形链表，指向环状链表的最后一个update，pendingUpdate.next指向第一个update
		const first = pendingUpdate.next; // 第一个
		let pending = pendingUpdate.next as Update<any>;

		// 保存baseState
		let newBaseState = baseState;
		let newBaseQueueFirst: Update<State> | null = null;
		let newBaseQueueLast: Update<State> | null = null;
		// newState为每次计算出来的结果，会被赋值给memoziedState
		let newState = baseState;

		do {
			const updateLane = pending.lane;
			if (!isSubsetOfLanes(renderLane, updateLane)) {
				// 优先级不够 被跳过
				const clone = createUpdate(pending.action, pending.lane);

				onSkipUpdate?.(clone);

				// 是不是第一个被跳过的
				if (newBaseQueueFirst === null) {
					// 第一个被跳过的update
					// first u0 last u0
					newBaseQueueFirst = clone;
					newBaseQueueLast = clone;
					// 固定baseState为最后一个没被跳过的update计算后的结果，后续计算也不会变了
					newBaseState = newState;
				} else {
					// first u0
					// last  u0
					// u0.next -> u1
					// last -> u1
					// u0 -> u1

					// first u0 -> u1
					// last  u1
					// u1.next -> u2
					// last -> u2
					// first u0 -> u1 -> u2
					// 不是第一个被跳过的
					(newBaseQueueLast as Update<State>).next = clone;
					newBaseQueueLast = clone;
				}
			} else {
				// 优先级足够，才能执行Update的action
				if (newBaseQueueLast !== null) {
					// 判断有没有被跳过的,
					// 如果有，需要将优先级够的update(当然他也会参与本次的计算)也加入到baseQueue中，优先级并将为NoLane
					const clone = createUpdate(pending.action, NoLane);
					newBaseQueueLast.next = clone;
					newBaseQueueLast = clone;
				}

				const action = pending.action;
				if (pending.eagerState) {
					// 第一次计算的结果记录到eagerState上，我们计算的时候可以复用
					newState = pending.eagerState;
				} else {
					newState = basicStateReducer(baseState, action);
				}
			}
			// 遍历下一个update
			pending = pending.next as Update<any>;
		} while (pending !== first);

		if (newBaseQueueLast === null) {
			// 本次计算没有update被跳过的
			// baseState和memoizedState是一致的
			newBaseState = newState;
		} else {
			// 本次计算有update被跳过的
			// 将newBaseQueueLast与newBaseQueueFirst合并为环状链表，并保存在baseQueue中
			newBaseQueueLast.next = newBaseQueueFirst;
		}
		result.memoizedState = newState;
		result.baseState = newBaseState;
		result.baseQueue = newBaseQueueLast;
	}
	return result;
};
