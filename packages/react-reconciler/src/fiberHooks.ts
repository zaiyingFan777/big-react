import internals from 'shared/internals';
import { FiberNode } from './fiber';
import { Dispatcher } from 'react/src/currentDispatcher';
import { Dispatch } from 'react/src/currentDispatcher';
import {
	UpdateQueue,
	createUpdateQueue,
	createUpdate,
	enqueueUpdate,
	processUpdateQueue
} from './updateQueue';
import { Action } from 'shared/ReactTypes';
import { scheduleUpdateOnFiber } from './workLoop';
import { Lane, NoLane, requestUpdateLane } from './fiberLanes';
import { Flags, PassiveEffect } from './fiberFlags';
import { HookHasEffect, Passive } from './hookEffectTags';

// 定义当前正在render的fiber
let currentlyRenderingFiber: FiberNode | null = null;
// 指向当前正在处理的FC中的hook
let workInProgressHook: Hook | null = null;
// 更新流程
let currentHook: Hook | null = null;
let renderLane: Lane = NoLane;

const { currentDispatcher } = internals;

// hooks的数据结构
interface Hook {
	// 对于useState，memoizedState保存的是状态
	memoizedState: any;
	updateQueue: unknown;
	next: Hook | null;
}

// useEffect/useLayoutEffect的数据结构
export interface Effect {
	tag: Flags; // 区分是什么effect
	create: EffectCallback | void;
	destory: EffectCallback | void;
	deps: EffectDeps;
	next: Effect | null;
}

// 函数组件的updateQueue
export interface FCUpdateQueue<State> extends UpdateQueue<State> {
	// 新增字段
	lastEffect: Effect | null; // 指向函数组件effect环状链表的最后一个effect
}

type EffectCallback = () => void;
type EffectDeps = any[] | null;

export function renderWithHooks(wip: FiberNode, lane: Lane) {
	// 赋值操作
	// 这样就可以记录当前正在render的FC对应的fiberNode，在fiberNode中保存hook数据
	currentlyRenderingFiber = wip;
	// 重置wip(fiberNode)的memoizedState为null，因为接下来的操作为创建一条hooks链表
	wip.memoizedState = null; // wip.memoizedState保存的是hooks链表
	// 重置effect链表
	wip.updateQueue = null;
	// 当前更新的优先级
	renderLane = lane;

	const current = wip.alternate;
	if (current !== null) {
		// update
		currentDispatcher.current = HooksDispatcherOnUpdate;
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
	// FC Render: FC返回的是 「jsx 编译后的结果」执行后的返回值，也就是ReactElement实例,
	// jsx编译结果就是jsx(div, …)然后咱们正好实现了jsx，咱们实现的jsx最后返回的就是reactElement实例
	const children = Component(props);

	// 重置操作
	currentlyRenderingFiber = null;
	workInProgressHook = null;
	currentHook = null;
	// 重置renderLane
	renderLane = NoLane;
	return children;
}

// mount流程时的dispatch
const HooksDispatcherOnMount: Dispatcher = {
	useState: mountState,
	useEffect: mountEffect
};

// update流程时的dispatch
const HooksDispatcherOnUpdate: Dispatcher = {
	useState: updateState,
	useEffect: updateEffect
};

// !!!注意：useEffect: render阶段发现fiber中存在PassiveEffect(存在需要执行的副作用),在commit阶段首先要调度副作用，调度一个回调函数的执行，为什么要调度？因为useEffect是一个异步的过程
// 要先进行调度的过程，调度完以后再同步收集回调，收集什么回调？收集当前这个useEffect他会触发哪些回调，收集完等commit结束后，再去异步的执行副作用。
// render阶段(FCfiberNode存在副作用) -> commit阶段（调度副作用->收集回调）->执行副作用(异步)
function mountEffect(create: EffectCallback | void, deps: EffectDeps | void) {
	// 找到当前useEffect对应的hook数据
	const hook = mountWorkInProgressHook();
	const nextDeps = deps === undefined ? null : deps;
	// mount时fiber是需要处理副作用的
	(currentlyRenderingFiber as FiberNode).flags |= PassiveEffect;
	// useEffect保存在hook({memoizedState:xxx,next:Hook,updateQueue:xxx})的memoizedState字段中
	// Passive | HookHasEffect 说明fiebr具有PassiveEffect，mount或者依赖变化时，effect hook Passive代表「useEffect对应effect」 HookHasEffect代表「当前effect本次更新存在副作用」
	hook.memoizedState = pushEffect(
		Passive | HookHasEffect, // mount的时候需要执行create
		create,
		undefined,
		nextDeps
	);
}

function updateEffect(create: EffectCallback | void, deps: EffectDeps | void) {
	// 找到当前useEffect对应的hook数据
	const hook = updateWorkInProgressHook();
	const nextDeps = deps === undefined ? null : deps;
	let destory: EffectCallback | void; // 在TS中只有undefined可以赋值给void类型

	if (currentHook !== null) {
		// 上一次更新的effect
		const prevEffect = currentHook.memoizedState as Effect;
		destory = prevEffect.destory;

		if (nextDeps !== null) {
			// 浅比较依赖
			const prevDeps = prevEffect.deps;
			if (areHookInputsEqual(nextDeps, prevDeps)) {
				// 依赖没有变化，不用触发回调Passive(空数组的情况)
				hook.memoizedState = pushEffect(Passive, create, destory, nextDeps);
				return;
			}
		}
		// 浅比较后 不相等
		(currentlyRenderingFiber as FiberNode).flags |= PassiveEffect;
		hook.memoizedState = pushEffect(
			Passive | HookHasEffect, // 需要触发回调
			create,
			destory,
			nextDeps
		);
	}
}

function areHookInputsEqual(nextDeps: EffectDeps, prevDeps: EffectDeps) {
	// useEffect(()=>{})第二个参数没有，每次都需要执行
	if (prevDeps === null || nextDeps === null) {
		return false;
	}
	for (let i = 0; i < prevDeps.length && i < nextDeps.length; i++) {
		// JS中==、===和Object.is()的区别 https://www.cnblogs.com/lindasu/p/7471519.html
		if (Object.is(prevDeps[i], nextDeps[i])) {
			continue;
		}
		return false;
	}
	return true;
}

// !!!注意：hooks无论useState还是useEffect的数据结构是 {memoizedState:xxx,next:Hook,updateQueue:xxx} 如果app函数组件有useEffect1、useEffect2、useRef、useEffect3
// 正常是 uE1.next -> uE2.next -> uR.next -> uE3这样的单向链表，但为了方便执行useEffect，将uesEffect变为环状链表，
// 然后uE1.memoizedState.next -> uE2.memoizedState(存储的是effect) uE2.memoizedState.next -> uE3.memoizedState uE3.memoizedState.next -> uE1
// effect环状列表保存在fiber的updateQueue里
// useEffect保存在hook({memoizedState:xxx,next:Hook,updateQueue:xxx})的memoizedState字段中
function pushEffect(
	hookFlags: Flags,
	create: EffectCallback | void,
	destory: EffectCallback | void,
	deps: EffectDeps
): Effect {
	// 定义一个新的effect
	const effect: Effect = {
		tag: hookFlags,
		create,
		destory,
		deps,
		next: null
	};
	const fiber = currentlyRenderingFiber as FiberNode;
	const updateQueue = fiber.updateQueue as FCUpdateQueue<any>;
	// 如果当前不存在uodateQueue
	if (updateQueue === null) {
		const updateQueue = createFCUpdateQueue();
		fiber.updateQueue = updateQueue;
		// 构成effect的环状链表
		effect.next = effect;
		// 将effect的环状链表放到updateQueue的updateQueue字段上
		updateQueue.lastEffect = effect;
	} else {
		// 插入effect
		const lastEffect = updateQueue.lastEffect;
		if (lastEffect === null) {
			// 构成effect的环状链表
			effect.next = effect;
			// 将effect的环状链表放到updateQueue的updateQueue字段上
			updateQueue.lastEffect = effect;
		} else {
			// 构造环状链表
			const firstEffect = lastEffect.next;
			lastEffect.next = effect;
			effect.next = firstEffect;
			// 再让updateQueue.lastEffect指向最后一个effect
			updateQueue.lastEffect = effect;
		}
	}
	return effect;
}

function createFCUpdateQueue<State>() {
	const updateQueue = createUpdateQueue<State>() as FCUpdateQueue<State>;
	updateQueue.lastEffect = null;
	return updateQueue;
}

function updateState<State>(): [State, Dispatch<State>] {
	// 找到当前useState对应的hook数据
	const hook = updateWorkInProgressHook();

	// 实现 updateState中 计算新state的逻辑
	const queue = hook.updateQueue as UpdateQueue<State>;
	const pending = queue.shared.pending;
	// 置空更新队列
	queue.shared.pending = null;

	if (pending !== null) {
		// 计算新值
		// hook.memoizedState是baseState
		const { memoizedState } = processUpdateQueue(
			hook.memoizedState,
			pending,
			renderLane
		);
		hook.memoizedState = memoizedState;
	}

	return [hook.memoizedState, queue.dispatch as Dispatch<State>];
}

function updateWorkInProgressHook(): Hook {
	// TODO render阶段触发的更新
	// function App() {
	// 	const [num, update] = useS(1);
	// 	// render时触发更新
	// 	update(100);
	// 	return <div>{num}</div>
	// }

	let nextCurrentHook: Hook | null;

	if (currentHook === null) {
		// 这是这个FC update时的第一个hook
		// 先找到当前的fiber，也就是currentlyRenderingFiber当前正在render的fiber的alternate
		const current = currentlyRenderingFiber?.alternate; // currentlyRenderingFiber为wip，wip.alternate为current
		if (current !== null) {
			nextCurrentHook = current?.memoizedState;
		} else {
			// current fiber为null，说明是mount阶段，但是mount时不会进入这个方法，说明是一些错误的边界情况
			nextCurrentHook = null;
		}
	} else {
		// 这个FC update时后续的hook
		nextCurrentHook = currentHook.next;
	}

	if (nextCurrentHook === null) {
		// 在mount/update(上一次) 有 useState(1) useState(2) useState(3)
		// 在本次update时         有 useState(1) useState(2) useState(3) useState(4) 这时候nextCurrent为null
		// if (xxx) { useState(4) }
		throw new Error(
			`组件${currentlyRenderingFiber?.type}本次执行时的Hook比上次执行时多`
		);
	}

	currentHook = nextCurrentHook as Hook;
	// 定义一个新的hook
	const newHook: Hook = {
		memoizedState: currentHook.memoizedState,
		updateQueue: currentHook.updateQueue,
		next: null
	};
	// 更新workInProgressHook
	if (workInProgressHook === null) {
		// mount时，第一个hook
		if (currentlyRenderingFiber === null) {
			// wip不为null
			// 没有在一个函数组件内执行useState，比如window.useState()
			throw new Error('请在函数组件内调用hook');
		} else {
			workInProgressHook = newHook;
			// 将hook挂载到fiberNode(wip)的memoizedState属性上
			currentlyRenderingFiber.memoizedState = workInProgressHook;
		}
	} else {
		// workInProgressHook不为Null
		// mount时 后续的hook
		workInProgressHook.next = newHook;
		// 这时候workInProgressHook指向第二个，第三个hook
		workInProgressHook = newHook;
	}
	return workInProgressHook;
}

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
	// 获取当前的优先级
	const lane = requestUpdateLane();
	// 这里执行setState的时候将update挂载到对应fiberNode的memoizedState上的单向hook链表上具体的某个链表的updateQueue的shared.pending上
	const update = createUpdate(action, lane);
	enqueueUpdate(updateQueue, update);
	// 从fiber拿到fiberRootNode
	scheduleUpdateOnFiber(fiber, lane);

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
