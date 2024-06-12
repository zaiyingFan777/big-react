import { Dispatch } from 'react/src/currentDispatcher';
import { Action } from 'shared/ReactTypes';
import { Lane } from './fiberLanes';

// update数据结构Type
// this.setState({xx:1})
// this.setState(({xx:1}) => ({xx:2}))
export interface Update<State> {
	action: Action<State>;
	lane: Lane;
	next: Update<any> | null;
}

// 创建Update实例的方法
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
	update: Update<State>
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
};

// 消费UpdateQueue中的Update的方法
export const processUpdateQueue = <State>(
	baseState: State, // 初始的状态
	pendingUpdate: Update<State> | null, // 要被消费的状态
	renderLane: Lane
): {
	memoizedState: State; // 返回全新的状态
} => {
	const result: ReturnType<typeof processUpdateQueue<State>> = {
		memoizedState: baseState
	};

	// pending: c a b c

	if (pendingUpdate !== null) {
		// pendingUpdate为环形链表，指向环状链表的最后一个update，pendingUpdate.next指向第一个update
		const first = pendingUpdate.next; // 第一个
		let pending = pendingUpdate.next as Update<any>;
		do {
			const updateLane = pending.lane;
			if (updateLane === renderLane) {
				// update的lane与本次更新的lane要一致，才能执行Update的action
				const action = pending.action;
				if (action instanceof Function) {
					// baseState 1 update (x) => 4x -> memoizedState 1*4 = 4
					baseState = action(baseState);
				} else {
					// baseState 1 update 2 -> memoizedState 2
					baseState = action;
				}
			} else {
				// todo???本次更新的Lane与update的lane不一致，则跳过，找下一个update
				if (__DEV__) {
					console.warn('不应该进入updateLane !== renderLane逻辑');
				}
			}
			// 遍历下一个update
			pending = pending.next as Update<any>;
		} while (pending !== first);
	}
	result.memoizedState = baseState;
	return result;
};
