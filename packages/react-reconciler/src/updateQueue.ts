import { Action } from 'shared/ReactTypes';

// update数据结构Type
// this.setState({xx:1})
// this.setState(({xx:1}) => ({xx:2}))
export interface Update<State> {
	action: Action<State>;
}

// 创建Update实例的方法
export const createUpdate = <State>(action: Action<State>): Update<State> => {
	return {
		action
	};
};

// 定义UpdateQueue
export interface UpdateQueue<State> {
	shared: {
		pending: Update<State> | null;
	};
}

// 初始化UpdateQueue实例的方法
export const createUpdateQueue = <State>(): UpdateQueue<State> => {
	return {
		shared: {
			pending: null
		}
	} as UpdateQueue<State>;
};

// 向UpdateQueue中添加Update
export const enqueueUpdate = <State>(
	updateQueue: UpdateQueue<State>,
	update: Update<State>
) => {
	updateQueue.shared.pending = update;
};

// 消费UpdateQueue中的Update的方法
export const processUpdateQueue = <State>(
	baseState: State, // 初始的状态
	pendingUpdate: Update<State> | null // 要被消费的状态
): {
	memoizedState: State; // 返回全新的状态
} => {
	const result: ReturnType<typeof processUpdateQueue<State>> = {
		memoizedState: baseState
	};

	if (pendingUpdate !== null) {
		const action = pendingUpdate.action;
		if (action instanceof Function) {
			// baseState 1 update (x) => 4x -> memoizedState 1*4 = 4
			result.memoizedState = action(baseState);
		} else {
			// baseState 1 update 2 -> memoizedState 2
			result.memoizedState = action;
		}
	}

	return result;
};
