// FunctionComponent相关代码

import { Dispatch } from 'react/src/currentDispatcher';
import { Dispatcher } from 'react/src/currentDispatcher';
import internals from 'shared/internals';
import { Action } from 'shared/ReactTypes';
import { FiberNode } from './fiber';
import {
	createUpdate,
	createUpdateQueue,
	enqueueUpdate,
	processUpdateQueue,
	UpdateQueue
} from './updateQueue';
import { scheduleUpdateOnFiber } from './workLoop';

// 当前正在render的fiber
let currentlyRenderingFiber: FiberNode | null = null;
// 当前我们正在处理的Hook(mount)
let workInProgressHook: Hook | null = null;
// update时期找到current fiber中的hook
let currentHook: Hook | null = null;

const { currentDispatcher } = internals;

// useState、useEffect通用Hook这种数据结构
interface Hook {
	memoizedState: any; // 保存了useEffect/useState自身状态的值
	updateQueue: unknown;
	next: Hook | null; // 指向下一个hook
}

export function renderWithHooks(wip: FiberNode) {
	// 赋值操作
	currentlyRenderingFiber = wip;
	// 重置操作 wip.memoizedState保存的是hook链表
	wip.memoizedState = null;

	const current = wip.alternate;

	if (current !== null) {
		// update
		currentDispatcher.current = HooksDispatcherOnUpdate;
	} else {
		console.log('mount');
		// mount
		// currentDispatcher.current 指向 mount时hook的实现
		currentDispatcher.current = HooksDispatcherOnMount;
	}

	// {
	// 	$$typeof: Symbol.for("react.element"),
	// 	type: App,        // 指向组件函数或类
	// 	props: { prop: "value" },
	// 	key: null,
	// 	ref: null
	// }
	// 拿到函数组件的函数
	const Component = wip.type;
	const props = wip.pendingProps;
	// FC render
	// 执行函数就是函数组件返回的Children
	const children = Component(props);

	// 重置操作
	currentlyRenderingFiber = null;
	workInProgressHook = null;
	currentHook = null;
	return children;
}

// mount时hook的实现
const HooksDispatcherOnMount: Dispatcher = {
	useState: mountState
};

// update时hook的实现
const HooksDispatcherOnUpdate: Dispatcher = {
	useState: updateState
};

function updateState<State>(): [State, Dispatch<State>] {
	// 找到当前useState对应的hook数据
	const hook = updateWorkInProgresHook();

	// 计算新state的逻辑
	const queue = hook.updateQueue as UpdateQueue<State>;
	const pending = queue.shared.pending;

	if (pending !== null) {
		const { memoizedState } = processUpdateQueue(hook.memoizedState, pending);
		hook.memoizedState = memoizedState;
	}

	return [hook.memoizedState, queue.dispatch as Dispatch<State>];
}

function updateWorkInProgresHook(): Hook {
	// TODO render阶段触发的更新

	// 用来保存下一个hook
	let nextCurrentHook: Hook | null;

	if (currentHook === null) {
		// 这是这个FC update时的第一个hook
		// 找到current fiber
		const current = currentlyRenderingFiber?.alternate;
		if (current !== null) {
			nextCurrentHook = current?.memoizedState;
		} else {
			// ! mount，但是Mount时期不能进入到这，这属于错误的边界情况
			nextCurrentHook = null;
		}
	} else {
		// 这个FC update时 后续的hook
		nextCurrentHook = currentHook.next;
	}

	if (nextCurrentHook === null) {
		// mount/update u1 u2 u3
		// update       u1 u2 u3 u4
		// if (xxx) {
		// 	useState()
		// }
		throw new Error(
			`组件${currentlyRenderingFiber?.type}本次执行时的Hook比上次执行时多`
		);
	}

	currentHook = nextCurrentHook as Hook;
	const newHook: Hook = {
		memoizedState: currentHook.memoizedState,
		updateQueue: currentHook.updateQueue,
		next: null
	};
	// 将newHook赋值给workInProgressHook
	if (workInProgressHook === null) {
		// update时 第一个hook
		if (currentlyRenderingFiber === null) {
			throw new Error('请在函数组件内调用hook');
		} else {
			workInProgressHook = newHook;
			currentlyRenderingFiber.memoizedState = workInProgressHook;
		}
	} else {
		// update时 后续的hook
		workInProgressHook.next = newHook;
		workInProgressHook = newHook;
	}
	return workInProgressHook;
}

function mountState<State>(
	initialState: (() => State) | State
): [State, Dispatch<State>] {
	// 找到当前useState对应的hook数据
	const hook = mountWorkInProgresHook();
	let memoizedState;
	if (initialState instanceof Function) {
		memoizedState = initialState();
	} else {
		memoizedState = initialState;
	}
	const queue = createUpdateQueue<State>();
	hook.updateQueue = queue;
	hook.memoizedState = memoizedState;

	/**
	 * * 这里为何使用bind? 我们把dispatch赋值给window，然后在其他地方使用这个方法也是可以的，因为dispatchSetState保存了fc的fiber节点
	 * function App() {
	 *   const [num, dispatch] = useState(0)
	 *   window.dispatch = dispatch
	 * }
	 * window.dispatch(xxx)
	 */
	// @ts-ignore
	const dispatch = dispatchSetState.bind(null, currentlyRenderingFiber, queue);
	queue.dispatch = dispatch;
	return [memoizedState, dispatch];
}

function dispatchSetState<State>(
	fiber: FiberNode,
	updateQueue: UpdateQueue<State>,
	action: Action<State>
) {
	const update = createUpdate(action);
	enqueueUpdate(updateQueue, update);
	// 从当前的fc fiber向上寻找到fiberRootNode，开启更新流程(renderRoot)
	scheduleUpdateOnFiber(fiber);
}

function mountWorkInProgresHook(): Hook {
	// mount时创建hook
	const hook: Hook = {
		memoizedState: null,
		updateQueue: null,
		next: null
	};
	if (workInProgressHook === null) {
		// mount时 第一个hook
		if (currentlyRenderingFiber === null) {
			// 直接在非函数组件调用hook报错
			throw new Error('请在函数组件内调用hook');
		} else {
			workInProgressHook = hook;
			currentlyRenderingFiber.memoizedState = workInProgressHook;
		}
	} else {
		// mount时 后续的hook
		workInProgressHook.next = hook;
		workInProgressHook = hook;
	}
	return workInProgressHook;
}
