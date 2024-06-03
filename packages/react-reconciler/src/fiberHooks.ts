import internals from 'shared/internals';
import { FiberNode } from './fiber';
import { Dispatch, Dispatcher } from 'react/src/currentDispatcher';
import {
	createUpdate,
	createUpdateQueue,
	enqueueUpdate,
	processUpdateQueue,
	UpdateQueue
} from './updateQueue';
import { Action } from 'shared/ReactTypes';
import { scheduleUpdateOnFiber } from './workLoop';

const { currentDispatcher } = internals;

// 当前正在render的fiber。
let currentlyRenderingFiber: FiberNode | null = null;
// 当前正在处理的Hook
let workInProgressHook: Hook | null = null;
// update
let currentHook: Hook | null = null;

// fc component fiber.memoizedState -> (useState -> useEffect)的链表
// 每个hook(useState)中的类型为Hook类型里面又有memoizedState字段，Hook保存的是useState或useEffect自身的值，
interface Hook {
	memoizedState: any;
	updateQueue: unknown;
	next: Hook | null;
}

export function renderWithHooks(wip: FiberNode) {
	// 将wip赋值给当前正在render的currentlyRenderingFiber
	currentlyRenderingFiber = wip;
	// 重置 wip.memoizedState保存的是hooks链表
	wip.memoizedState = null;

	const current = wip.alternate;

	/**
	 * 关于数据共享层的一些感想，首先我们在react包里定义了currentDispatcher但是current为Null，为了共用一个对象并且不在react-dom中打包react，我们在shared包里定义了internals，
	 * 并且internals是引用的react包中的currentDispatcher，然后在renderWithHooks函数中根据mount或update去给currentDispatcher.current赋值（mount、update中useState、useEffect的实现集）
	 * 因为react是纯运行时，组件当处于什么状态使用什么状态的currentDispatcher.current
	 */
	// 在执行Component函数前，赋值currentDispatcher.current(useState、useEffect, 分为mount update)
	// 然后在执行Component函数时调用useState就是这里赋值的
	if (current !== null) {
		// update
		currentDispatcher.current = HooksDispatcherOnUpdate;
	} else {
		// mount
		currentDispatcher.current = HooksDispatcherOnMount;
	}

	const Component = wip.type;
	const props = wip.pendingProps;
	// fc render
	const children = Component(props);

	// 重置操作
	currentlyRenderingFiber = null;
	workInProgressHook = null;
	currentHook = null;
	return children;
}

// mount阶段hooks实现的集合
const HooksDispatcherOnMount: Dispatcher = {
	useState: mountState
};

const HooksDispatcherOnUpdate: Dispatcher = {
	useState: updateState
};

function updateState<State>(): [State, Dispatch<State>] {
	// 找到当前useState对应的hook数据
	const hook = updateWorkInProgressHook();

	// 计算新state的逻辑
	const queue = hook.updateQueue as UpdateQueue<State>;
	const pending = queue.shared.pending;

	if (pending !== null) {
		const { memoizedState } = processUpdateQueue(hook.memoizedState, pending);
		hook.memoizedState = memoizedState;
	}

	return [hook.memoizedState, queue.dispatch as Dispatch<State>];
}

function updateWorkInProgressHook(): Hook {
	// TODO render阶段触发的更新
	// function App() {
	// 	const [num, update] = useState(0);
	// 	// 触发更新
	// 	update(100);
	// 	return <div>{num}</div>;
	// }
	// 保存下一个hook的变量
	let nextCurrentHook: Hook | null;

	if (currentHook === null) {
		// 这是这个FC update的第一个hook
		// 找到current fiber
		const current = currentlyRenderingFiber?.alternate;
		if (current !== null) {
			nextCurrentHook = current?.memoizedState;
		} else {
			// mount
			nextCurrentHook = null;
		}
	} else {
		// 这个FC update时 后续的Hook
		nextCurrentHook = currentHook.next;
	}

	if (nextCurrentHook === null) {
		// mount/update  u1 u2 u3
		// update        u1 u2 u3 u4
		// if (xxx) {useState()} u4
		throw new Error(
			`组件${currentlyRenderingFiber?.type}本次执行时的Hook比上次执行时多`
		);
	}

	// currentHook 指针改变
	currentHook = nextCurrentHook as Hook;

	const newHook: Hook = {
		memoizedState: currentHook.memoizedState,
		next: null,
		updateQueue: currentHook.updateQueue
	};

	if (workInProgressHook === null) {
		// mount时，本fc的第一个hook
		if (currentlyRenderingFiber === null) {
			throw new Error('请在函数组件内调用hook');
		} else {
			workInProgressHook = newHook;
			currentlyRenderingFiber.memoizedState = workInProgressHook;
		}
	} else {
		// mount时，后续的hook
		workInProgressHook.next = newHook;
		// workInProgressHook指向后续的hook
		workInProgressHook = newHook;
	}

	return workInProgressHook;
}

// hooks上下文 这种是报错的
// function App() {
// 	useEffect(() => {
// 		useState()
// 	})
// }

// 实现useState
// 实现mount时useState的实现
// 实现dispatch方法，并接入现有更新流程内

function mountState<State>(
	initialState: (() => State) | State
): [State, Dispatch<State>] {
	// 找到当前useState对应的hook数据
	const hook = mountWorkInProgressHook();
	let memoizedState;
	if (initialState instanceof Function) {
		// const [count, setCount] = useState(() => {
		// 	// 这个函数将在组件的第一次渲染时被调用
		// 	return 0; // 函数的返回值将作为状态的初始值
		// });
		memoizedState = initialState();
	} else {
		memoizedState = initialState;
	}

	const queue = createUpdateQueue<State>();
	hook.updateQueue = queue;
	hook.memoizedState = memoizedState;

	// function App() {
	// 	const [x, setX] = useState(1);
	// 	window.dispatch = setX;
	// }
	// // 脱离函数组件后依然可以使用setX
	// dispatch(123);
	// 这是因为dispatchSetState保存了当前的fiberNode
	// ps: bind
	// function testBind(a, b, c) {
	// 	console.log(a,b,c)
	// }
	// var testBind2 = testBind.bind(null, 1,2)
	// testBind2(3) => 1,2,3
	// @ts-ignore
	const dispatch = dispatchSetState.bind(null, currentlyRenderingFiber, queue);
	queue.dispatch = dispatch;
	return [memoizedState, dispatch];
}

// dispatch方法  从当前触发更新的fiebrNode调度更新(从当前fiebr找到fiberRootNode)
function dispatchSetState<State>(
	fiber: FiberNode,
	updateQueue: UpdateQueue<State>,
	action: Action<State>
) {
	// 创建更新
	const update = createUpdate<State>(action);
	enqueueUpdate(updateQueue, update);
	scheduleUpdateOnFiber(fiber);
}

function mountWorkInProgressHook(): Hook {
	// mount时创建hook
	const hook: Hook = {
		memoizedState: null,
		updateQueue: null,
		next: null
	};
	if (workInProgressHook === null) {
		// mount时，本fc的第一个hook
		if (currentlyRenderingFiber === null) {
			throw new Error('请在函数组件内调用hook');
		} else {
			workInProgressHook = hook;
			currentlyRenderingFiber.memoizedState = workInProgressHook;
		}
	} else {
		// mount时，后续的hook
		workInProgressHook.next = hook;
		// workInProgressHook指向后续的hook
		workInProgressHook = hook;
	}
	return workInProgressHook;
}
