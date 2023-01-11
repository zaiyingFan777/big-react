import internals from 'shared/internals';
import { FiberNode } from './fiber';
import { Dispatcher } from 'react/src/currentDispatcher';
import { Dispatch } from 'react/src/currentDispatcher';
import {
	UpdateQueue,
	createUpdateQueue,
	createUpdate,
	enqueueUpdate
} from './updateQueue';
import { Action } from 'shared/ReactTypes';
import { scheduleUpdateOnFiber } from './workLoop';

// 定义当前正在render的fiber
let currentlyRenderingFiber: FiberNode | null = null;
// 指向当前正在处理的FC中的hook
let workInProgressHook: Hook | null = null;

const { currentDispatcher } = internals;

// hooks的数据结构
interface Hook {
	// 对于useState，memoizedState保存的是状态
	memoizedState: any;
	updateQueue: unknown;
	next: Hook | null;
}

export function renderWithHooks(wip: FiberNode) {
	// 赋值操作
	// 这样就可以记录当前正在render的FC对应的fiberNode，在fiberNode中保存hook数据
	currentlyRenderingFiber = wip;
	// 重置wip(fiberNode)的memoizedState为null，因为接下来的操作为创建一条hooks链表
	wip.memoizedState = null;

	const current = wip.alternate;
	if (current !== null) {
		// update
	} else {
		// mount
		// currentDispatcher.current指向了mount时的hooks的实现
		currentDispatcher.current = HooksDispatcherOnMount;
	}

	// 对于函数组件，函数组件保存在了type上
	const Component = wip.type;
	// 获取props
	const props = wip.pendingProps;
	// 获取children，函数执行结果
	// 这里执行Component也就是函数组件的函数时，会执行函数组件的hook，
	// 比如执行useState(100)，initialState为100,开始执行mountState方法。
	// mountState里面就会将当前的fiberNode，将单项Hook链表挂载到fiberNode的memoizedState属性上，然后根据不同的hook初始化hook的memoizedState值，以及将后面的hook链表挂载到单向链表上
	// 当setState执行的时候执行dispatchSetState，从当前的fiberNode遍历到fiberROOtNode上，执行renderRoot过程
	const children = Component(props);

	// 重置操作
	currentlyRenderingFiber = null;
	return children;
}

const HooksDispatcherOnMount: Dispatcher = {
	useState: mountState
};

// 不能在Hook中调用hook
// function App() {
// 	useEffect(() => {
// 		useState()
// 	})
// }

function mountState<State>(
	initialState: (() => State) | State
): [State, Dispatch<State>] {
	// 找到当前useState对应的hook数据
	const hook = mountWorkInProgressHook();
	let memoizedState;
	if (initialState instanceof Function) {
		memoizedState = initialState();
	} else {
		memoizedState = initialState;
	}
	// useState是可以触发更新的，需要创建一个updateQueue
	const queue = createUpdateQueue<State>();
	hook.updateQueue = queue;
	hook.memoizedState = memoizedState;

	// 这里为何使用bind,
	// function App() {
	// 	const [x, dispatch] = useState();
	// 	window.dispatch = dispatch;
	// }
	// dispatch(1111);
	// 上面这种情况也是可以触发更新的，因为dispatchSetState已经保存了fiber节点
	// currentlyRenderingFiber对应的就是fiber参数，就是说currentlyRenderingFiber已经预置在暴漏的dispatch中
	// 这样就可以像上面，在其他地方脱离了当前的function component的地方调用dispatch方法
	// 这样我们调用dispatch只需要传action方法
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
	// 这里执行setState的时候将update挂载到对应fiberNode的memoizedState上的单向hook链表上具体的某个链表的updateQueue的shared.pending上
	const update = createUpdate(action);
	enqueueUpdate(updateQueue, update);
	// 从fiber拿到fiberRootNode
	scheduleUpdateOnFiber(fiber);

	// // 首屏渲染触发更新
	// const update = createUpdate<ReactElementType | null>(element);
	// // 将更新插入到updateQueue
	// enqueueUpdate(
	// 	hostRootFiber.updateQueue as UpdateQueue<ReactElementType | null>,
	// 	update
	// );
	// scheduleUpdateOnFiber(hostRootFiber);
}

function mountWorkInProgressHook(): Hook {
	const hook: Hook = {
		memoizedState: null,
		updateQueue: null,
		next: null
	};
	if (workInProgressHook === null) {
		// mount时，第一个hook
		if (currentlyRenderingFiber === null) {
			// 没有在一个函数组件内执行useState，比如window.useState()
			throw new Error('请在函数组件内调用hook');
		} else {
			workInProgressHook = hook;
			// 将hook挂载到fiberNode的memoizedState属性上
			currentlyRenderingFiber.memoizedState = workInProgressHook;
		}
	} else {
		// workInProgressHook不为Null
		// mount时 后续的hook
		workInProgressHook.next = hook;
		// 这时候workInProgressHook指向第二个，第三个hook
		workInProgressHook = hook;
	}
	return workInProgressHook;
}
