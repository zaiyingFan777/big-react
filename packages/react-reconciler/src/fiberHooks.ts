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
	Update,
	UpdateQueue
} from './updateQueue';
import { scheduleUpdateOnFiber } from './workLoop';
import { DefaultLane, Lane, NoLane, requestUpdateLane } from './fiberLanes';
import { Flags, PassiveEffect } from './fiberFlags';
import { HookHasEffect, Passive } from './hookEffectTags';
import currentBatchConfig from 'react/src/currentBatchConfig';

// 当前正在render的fiber
let currentlyRenderingFiber: FiberNode | null = null;
// 当前我们正在处理的Hook(mount)
let workInProgressHook: Hook | null = null;
// update时期找到current fiber中的hook
let currentHook: Hook | null = null;
// 本次更新的优先级
let renderLane: Lane = NoLane;

const { currentDispatcher } = internals;

// useState、useEffect通用Hook这种数据结构
interface Hook {
	memoizedState: any; // 保存了useEffect/useState自身状态的值
	updateQueue: unknown;
	next: Hook | null; // 指向下一个hook
	baseState: any;
	baseQueue: Update<any> | null;
}

// hook(useEffect).memoizedState保存的useEffect的数据
export interface Effect {
	tag: Flags;
	create: EffectCallback | void;
	destroy: EffectCallback | void;
	deps: EffectDeps;
	next: Effect | null;
}

export interface FCUpdateQueue<State> extends UpdateQueue<State> {
	lastEffect: Effect | null;
}

type EffectCallback = () => void;
type EffectDeps = any[] | null;

export function renderWithHooks(wip: FiberNode, lane: Lane) {
	// 赋值操作
	currentlyRenderingFiber = wip;
	// 重置操作 wip.memoizedState保存的是hook链表
	wip.memoizedState = null;
	// 重置 effect链表
	wip.updateQueue = null;
	renderLane = lane;

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
	// 执行完函数组件，重置renderlane为nolane
	renderLane = NoLane;
	return children;
}

// mount时hook的实现
const HooksDispatcherOnMount: Dispatcher = {
	useState: mountState,
	useEffect: mountEffect,
	useTransition: mountTransition,
	useRef: mountRef
};

// update时hook的实现
const HooksDispatcherOnUpdate: Dispatcher = {
	useState: updateState,
	useEffect: updateEffect,
	useTransition: updateTransition,
	useRef: updateRef
};

// re = useRef(null)
function mountRef<T>(initialValue: T): { current: T } {
	const hook = mountWorkInProgresHook();
	const ref = { current: initialValue };
	hook.memoizedState = ref;
	return ref;
}

function updateRef<T>(initialValue: T): { current: T } {
	const hook = updateWorkInProgresHook();
	return hook.memoizedState;
}

function mountEffect(create: EffectCallback | void, deps: EffectDeps | void) {
	const hook = mountWorkInProgresHook();
	const nextDeps = deps === undefined ? null : deps;
	// mount时需要触发create回调
	(currentlyRenderingFiber as FiberNode).flags |= PassiveEffect;

	// mount时需要触发create回调(HookHasEffect)
	hook.memoizedState = pushEffect(
		Passive | HookHasEffect,
		create,
		undefined,
		nextDeps
	);
}

function updateEffect(create: EffectCallback | void, deps: EffectDeps | void) {
	const hook = updateWorkInProgresHook();
	const nextDeps = deps === undefined ? null : deps;
	let destroy: EffectCallback | void;

	// current的effect
	if (currentHook !== null) {
		const prevEffect = currentHook.memoizedState as Effect;
		destroy = prevEffect.destroy;

		if (nextDeps !== null) {
			// 浅比较依赖
			const prevDeps = prevEffect.deps;
			if (areHookInputsEqual(nextDeps, prevDeps)) {
				hook.memoizedState = pushEffect(Passive, create, destroy, nextDeps);
				return;
			}
		}
		// 浅比较 不相等
		(currentlyRenderingFiber as FiberNode).flags |= PassiveEffect;
		hook.memoizedState = pushEffect(
			Passive | HookHasEffect,
			create,
			destroy,
			nextDeps
		);
	}
}

function areHookInputsEqual(nextDeps: EffectDeps, prevDeps: EffectDeps) {
	if (prevDeps === null || nextDeps === null) {
		return false;
	}
	for (let i = 0; i < prevDeps.length && i < nextDeps.length; i++) {
		if (Object.is(prevDeps[i], nextDeps[i])) {
			continue;
		}
		return false;
	}
	return true;
}

function pushEffect(
	hookFlags: Flags,
	create: EffectCallback | void,
	destroy: EffectCallback | void,
	deps: EffectDeps
): Effect {
	const effect: Effect = {
		tag: hookFlags,
		create,
		destroy,
		deps,
		next: null
	};
	const fiber = currentlyRenderingFiber as FiberNode;
	const updateQueue = fiber.updateQueue as FCUpdateQueue<any>;
	if (updateQueue === null) {
		const updateQueue = createFCUpdateQueue();
		fiber.updateQueue = updateQueue;
		// 创建环状链表;
		effect.next = effect;
		updateQueue.lastEffect = effect;
	} else {
		// 插入effect
		const lastEffect = updateQueue.lastEffect;
		if (lastEffect === null) {
			effect.next = effect;
			updateQueue.lastEffect = effect;
		} else {
			// 创建环状链表
			const firstEffect = lastEffect.next;
			lastEffect.next = effect;
			effect.next = firstEffect;
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
	const hook = updateWorkInProgresHook();

	// 计算新state的逻辑
	const queue = hook.updateQueue as UpdateQueue<State>;
	const baseState = hook.baseState;
	const pending = queue.shared.pending;
	const current = currentHook as Hook;
	// 从current中取出baseQueue
	let baseQueue = current.baseQueue;
	// 消费掉了update，所以这里置空
	queue.shared.pending = null;

	if (pending !== null) {
		// 不考虑并发更新的时候
		// const { memoizedState } = processUpdateQueue(
		// 	hook.memoizedState,
		// 	pending,
		// 	renderLane
		// );
		// hook.memoizedState = memoizedState;

		// * pending/baseQueue的update保存在current中
		// 将两条链表合并到一起再保存到current中
		if (baseQueue !== null) {
			// baseQueue b2 -> b0 -> b1 -> b2
			// pendingQueue p2 -> p0 -> p1 -> p2
			// b0
			const baseFirst = baseQueue.next;
			// p0
			const pendingFirst = pending.next;
			// b2 -> p0
			baseQueue.next = pendingFirst;
			// p2 -> b0
			pending.next = baseFirst;
			// p2 -> b0 -> b1 -> b2 -> p0 -> p1 -> p2
		}
		baseQueue = pending;
		// 保存在current中
		current.baseQueue = pending;
		queue.shared.pending = null;
	}

	if (baseQueue !== null) {
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
		next: null,
		baseQueue: currentHook.baseQueue,
		baseState: currentHook.baseState
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
	hook.baseState = memoizedState;

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

function mountTransition(): [boolean, (callback: () => void) => void] {
	const [isPending, setPending] = mountState(false);
	const hook = mountWorkInProgresHook();
	const start = startTransition.bind(null, setPending);
	hook.memoizedState = start;
	return [isPending, start];
}

// boolean: 是否在pending中
function updateTransition(): [boolean, (callback: () => void) => void] {
	const [isPending] = updateState();
	const hook = updateWorkInProgresHook();
	const start = hook.memoizedState;
	return [isPending as boolean, start];
}

function startTransition(setPending: Dispatch<boolean>, callback: () => void) {
	setPending(true);
	const prevTransition = currentBatchConfig.transition;
	currentBatchConfig.transition = 1;

	callback();
	setPending(false);

	currentBatchConfig.transition = prevTransition;
}

function dispatchSetState<State>(
	fiber: FiberNode,
	updateQueue: UpdateQueue<State>,
	action: Action<State>
) {
	const lane = requestUpdateLane();
	const update = createUpdate(action, lane);
	enqueueUpdate(updateQueue, update);
	// 从当前的fc fiber向上寻找到fiberRootNode，开启更新流程(renderRoot)
	scheduleUpdateOnFiber(fiber, lane);
}

function mountWorkInProgresHook(): Hook {
	// mount时创建hook
	const hook: Hook = {
		memoizedState: null,
		updateQueue: null,
		baseState: null,
		baseQueue: null,
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
