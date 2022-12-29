import { Action } from 'shared/ReactTypes';

// 更新
// action
// this.setState({xx: 1})
// this.setState(({xx: 1}) => {xx: 2})
export interface Update<State> {
	action: Action<State>;
}

// 创建更新
export const createUpdate = <State>(action: Action<State>): Update<State> => {
	return {
		action
	};
};

// updateQueue
export interface UpdateQueue<State> {
	shared: {
		pending: Update<State> | null;
	};
}

// 实例化updateQueue的方法
export const createUpdateQueue = <State>() => {
	return {
		shared: {
			pending: null
		}
	} as UpdateQueue<State>;
};

// 往UpdateQueue里面增加Update
export const enqueueUpdate = <State>(
	updateQueue: UpdateQueue<State>,
	update: Update<State>
) => {
	updateQueue.shared.pending = update;
};

// updateQueue消费update的方法
// 返回值全新的状态
export const processUpdateQueue = <State>(
	baseState: State, // 初始的状态
	pendingUpdate: Update<State> | null // 要消费的状态
): { memoizedState: State } => {
	const result: ReturnType<typeof processUpdateQueue<State>> = {
		memoizedState: baseState
	};

	if (pendingUpdate !== null) {
		const action = pendingUpdate.action;
		if (action instanceof Function) {
			// baseState 1，update (x) => 4x 得到 -> memoizedState 1*4=4
			result.memoizedState = action(baseState);
		} else {
			// baseState 1，update 2 得到 -> memoizedState 2
			result.memoizedState = action;
		}
	}

	return result;
};
