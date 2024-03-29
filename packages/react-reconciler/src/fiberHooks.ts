import internals from 'shared/internals';
import { FiberNode } from './fiber';
import { Dispatcher } from 'react/src/currentDispatcher';
import { Dispatch } from 'react/src/currentDispatcher';
import currentBatchConfig from 'react/src/currentBatchConfig';
import {
	UpdateQueue,
	createUpdateQueue,
	createUpdate,
	enqueueUpdate,
	processUpdateQueue,
	Update
} from './updateQueue';
import { Action, ReactContext } from 'shared/ReactTypes';
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
	// 对于useEffect，memoizedState保存的是Effect数据结构
	// 对于useTransition，memoizedState保存的是startTransition函数
	memoizedState: any;
	updateQueue: unknown;
	next: Hook | null;
	baseState: any;
	baseQueue: Update<any> | null;
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
	useEffect: mountEffect,
	useTransition: mountTransition,
	useRef: mountRef,
	useContext: readContext
};

// update流程时的dispatch
const HooksDispatcherOnUpdate: Dispatcher = {
	useState: updateState,
	useEffect: updateEffect,
	useTransition: updateTransition,
	useRef: updateRef,
	useContext: readContext
};

// re = useRef(null)
function mountRef<T>(initialValue: T): { current: T } {
	// 获取当前的hook
	const hook = mountWorkInProgressHook();
	const ref = { current: initialValue };
	hook.memoizedState = ref;
	return ref;
}

function updateRef<T>(): { current: T } {
	// 获取当前的hook
	const hook = updateWorkInProgressHook();
	return hook.memoizedState;
}

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
	const baseState = hook.baseState;

	const pending = queue.shared.pending;
	const current = currentHook as Hook;
	let baseQueue = current.baseQueue;

	// 保存update的问题
	// 更新的时候可能会被高优先级打断，考虑将update保存在current中。只要不进入commit阶段，current与wip不会互换，所以保存在current中，
	// 即使多次执行render阶段，只要不进入commit阶段，都能从current中恢复数据。
	if (pending !== null) {
		// pending baseQueue(被跳过的第一个以及后面的update组成的环状链表) update保存在current中
		// 将pending与baseQueue合并到一块
		if (baseQueue !== null) {
			// baseQueue b2 -> b0 -> b1 -> b2
			// pendingQueue p2 -> p0 -> p1 -> p2
			// b0
			const baseFirst = baseQueue.next; // baseQueue指向的最后一个，最后一个的next指向第一个
			// p0
			const pendingFirst = pending.next;

			// b2 -> p0
			baseQueue.next = pendingFirst;
			// p2 -> b0
			pending.next = baseFirst;
			// 合并为
			// p2 -> b0 -> b1 -> b2 -> p0 -> p1 -> p2
		}
		baseQueue = pending;
		// 将合并的链表保存在current中
		current.baseQueue = pending;
		// 置空
		queue.shared.pending = null;
	}

	if (baseQueue !== null) {
		// 计算新值
		// hook.memoizedState是baseState
		const {
			memoizedState,
			baseQueue: newBaseQueue,
			baseState: newBaseState
		} = processUpdateQueue(baseState, baseQueue, renderLane);
		hook.memoizedState = memoizedState;
		hook.baseState = newBaseState;
		hook.baseQueue = newBaseQueue;
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
		next: null,
		baseQueue: currentHook.baseQueue,
		baseState: currentHook.baseState
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
	// 初始化的时候，也需要将memoizedState计算的值赋值给baseState，不然会导致他成null
	hook.baseState = memoizedState;

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
		next: null,
		baseQueue: null,
		baseState: null
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

// 实现useTransition 切换UI时，先显示旧的UI，待新的UI加载完成后再显示新的UI。也就是不会阻塞ui，因为开启后为并发更新

// useTransition的作用翻译成源码术语：
// ps: 比如demo中的例子我切换tab遇到耗时的操作，我没有立即切换到对应页面，因为我是transitionLane，
// 并发更新，我在内存中构建好了再切换过去(哪怕是同步优先级也是这样，在内存中构建好了再切换，)。并且不影响我高优先级的操作（这点是对的，不影响更高优先级的操作），
// 比如hover的效果 如果不是transitionLane，是同步优先级，那就会影响其他的操作
// 切换UI -> 触发更新
// 先显示旧的UI，待新的UI加载完成后再显示新的UI -> 「切换新UI」对应低优先级更新

// 实现的要点：
// 实现基础hook工作流程
// 实现Transition优先级
// useTransition的实现细节

// useTransition两个返回值 第一个boolean是否在tranition中，第二个就是函数
// mount
function mountTransition(): [boolean, (callback: () => void) => void] {
	const [isPending, setPending] = mountState(false);
	const hook = mountWorkInProgressHook();
	const start = startTransition.bind(null, setPending);
	// 将start保存在hook上
	hook.memoizedState = start;
	return [isPending, start];
}

// update
function updateTransition(): [boolean, (callback: () => void) => void] {
	// 从hook中取到start
	const [isPending] = updateState();
	const hook = updateWorkInProgressHook();
	const start = hook.memoizedState;
	return [isPending as boolean, start];
}

//  useTransition 内部包含了 useState(setPending)、hook(第二个参数的回调函数)
//  startTransition 触发三次更新
//  setPending(true) 同步优先级
//  改变优先级 ---------------
//  callback() 里面还可能包含setState 但都是transitionLane
//  setPending(false) transitionLane
//  还原优先级 ---------------
// callback开发者传递的回调函数
function startTransition(setPending: Dispatch<boolean>, callback: () => void) {
	setPending(true);
	// 获取之前的transition并保存
	const preTransition = currentBatchConfig.transition;
	// 进入当前的transition
	currentBatchConfig.transition = 1;

	callback();
	setPending(false);

	// 回到之前的transition
	currentBatchConfig.transition = preTransition;
}

// useContext
function readContext<T>(context: ReactContext<T>) {
	const consumer = currentlyRenderingFiber;
	// 在函数组件之外调用了useContext或者useEffect内部调用了useContext
	if (consumer === null) {
		throw new Error('context需要有consumer');
	}
	const value = context._currentValue;
	return value;
}
