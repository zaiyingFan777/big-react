import { Action } from 'shared/ReactTypes';

// action
// 1.state, this.setState({xx: 1})
// 2.function, this.setState(({xx: 1}) => {xx: 2})
export interface Update<State> {
	action: Action<State>;
}

// 创建update实例的方法
export const createUpdate = <State>(action: Action<State>): Update<State> => {
	return {
		action
	};
};

// UpdateQueue
export interface UpdateQueue<State> {
	shared: {
		pending: Update<State> | null;
	};
}

// ?
// export const createUpdateQueue = <State>() => {
// 	return {
// 		shared: {
// 			pending: null
// 		}
// 	} as UpdateQueue<State>;
// };

export const createUpdateQueue = <Action>() => {
	return {
		shared: {
			pending: null
		}
	} as UpdateQueue<Action>;
};

// 向updateQueue增加update
export const enqueueUpdate = <Action>(
	updateQueue: UpdateQueue<Action>,
	update: Update<Action>
) => {
	updateQueue.shared.pending = update;
};

// 消费updateQueue中的update，返回全新的状态
export const processUpdateQueue = <State>(
	baseState: State,
	pendingUpdate: Update<State> | null
): {
	memoizedState: State;
} => {
	const result: ReturnType<typeof processUpdateQueue<State>> = {
		memoizedState: baseState
	};

	if (pendingUpdate !== null) {
		const action = pendingUpdate.action;
		if (action instanceof Function) {
			// 2. baseState: 1, update: (x) => 2x => memoizedState: 2
			result.memoizedState = action(baseState);
		} else {
			// 1. baseState: 1, update: 2 => memoizedState: 2
			result.memoizedState = action;
		}
	}

	return result;
};
