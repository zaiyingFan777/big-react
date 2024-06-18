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
import { Lane, NoLane, requestUpdateLane } from './fiberLanes';
import { Flags, PassiveEffect } from './fiberFlags';
import { HookHasEffect, Passive } from './hookEffectTags';

const { currentDispatcher } = internals;

// 当前正在render的fiber。
let currentlyRenderingFiber: FiberNode | null = null;
// 当前正在处理的Hook
let workInProgressHook: Hook | null = null;
// update
let currentHook: Hook | null = null;
// 当前正在更新的lane
let renderLane: Lane = NoLane;

// fc component fiber.memoizedState -> (useState -> useEffect)的链表
// 每个hook(useState)中的类型为Hook类型里面又有memoizedState字段，Hook保存的是useState或useEffect自身的值，
interface Hook {
	memoizedState: any;
	updateQueue: unknown;
	next: Hook | null;
}

// effect数据结构，存在于fiber.memoizedState属性中的Hook.memoizedState中
// effect环状链表又保存在fiber.updateQueue中
export interface Effect {
	tag: Flags;
	create: EffectCallback | void; // 1.mount时 2.依赖变化时，触发create回调
	destroy: EffectCallback | void; // 函数组件销毁时，触发回调
	deps: EffectDeps;
	next: Effect | null; // 环状链表，指向下一个effect(hook.memoizedState)，不需要遍历hook链表就可以找到下一个effect相关hook数据
}

type EffectCallback = () => void;
type EffectDeps = any[] | null;

// 函数组件的UpdateQueue
export interface FCUpdateQueue<State> extends UpdateQueue<State> {
	lastEffect: Effect | null; // 指向effect链表的最后一个，那么lastEffect.next就指向第一个effect
}

export function renderWithHooks(wip: FiberNode, lane: Lane) {
	// 将wip赋值给当前正在render的currentlyRenderingFiber
	currentlyRenderingFiber = wip;
	// 重置 wip.memoizedState保存的是hooks链表
	wip.memoizedState = null;
	// 重置effect链表
	wip.updateQueue = null;
	renderLane = lane;

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
	renderLane = NoLane;
	return children;
}

// mount阶段hooks实现的集合
const HooksDispatcherOnMount: Dispatcher = {
	useState: mountState,
	useEffect: mountEffect
};

const HooksDispatcherOnUpdate: Dispatcher = {
	useState: updateState,
	useEffect: updateEffect
};

function mountEffect(create: EffectCallback | void, deps: EffectDeps | void) {
	// 找到当前useEffect对应的hook数据
	const hook = mountWorkInProgressHook();
	const nextDeps = deps === undefined ? null : deps;
	// 当前函数fiber增加PassiveEffect
	// mount时需要处理effect副作用
	(currentlyRenderingFiber as FiberNode).flags |= PassiveEffect;
	// 因为是mount所以我们需要执行create，因此useEffect的tag需要是Passive | HookHasEffect
	hook.memoizedState = pushEffect(
		Passive | HookHasEffect,
		create,
		undefined,
		nextDeps
	);
}

function updateEffect(create: EffectCallback | void, deps: EffectDeps | void) {
	// 找到当前useEffect对应的hook数据
	const hook = updateWorkInProgressHook();
	const nextDeps = deps === undefined ? null : deps;
	let destroy: EffectCallback | void;

	if (currentHook !== null) {
		const prevEffect = currentHook.memoizedState as Effect;
		destroy = prevEffect.destroy;

		if (nextDeps !== null) {
			// 浅比较依赖
			const prevDeps = prevEffect.deps;
			if (areHookInputsEqual(nextDeps, prevDeps)) {
				// 依赖没有变，不应该触发回调
				hook.memoizedState = pushEffect(Passive, create, destroy, nextDeps);
				return;
			}
		}
		// 浅比较后不相等，需要执行回调函数(副作用)
		(currentlyRenderingFiber as FiberNode).flags |= PassiveEffect;
		hook.memoizedState = pushEffect(
			Passive | HookHasEffect,
			create,
			destroy,
			nextDeps
		);
	}
}

// 浅比较依赖
function areHookInputsEqual(nextDeps: EffectDeps, prevDeps: EffectDeps) {
	if (prevDeps === null || nextDeps === null) {
		// 比较失败，比如useEffect第二个参数没有执行，因此每次都得执行useEffect
		return false;
	}
	for (let i = 0; i < prevDeps.length && i < nextDeps.length; i++) {
		// ps: Object.is
		// Object.is 是 JavaScript 中的一个静态方法，它用于比较两个值是否严格相等。与 === 操作符不同，Object.is 会按照以下规则比较两个值：
		// 如果两个值都是 NaN，则 Object.is 返回 true。而 === 在比较 NaN 时总是返回 false。
		// 如果两个值中的任何一个是 +0，另一个是 -0，则 Object.is 返回 false。而 === 在比较 +0 和 -0 时会返回 true。
		// 所有其他情况下，Object.is 的行为与严格等于操作符 === 相同。

		// 以下是一些 Object.is 的使用示例：

		// Object.is(1, 1); // true
		// Object.is(1, '1'); // false

		// Object.is(0, -0); // false
		// Object.is(-0, -0); // true

		// Object.is(NaN, NaN); // true
		// Object.is(NaN, Object.create(null)); // false

		// Object.is(null, null); // true
		// Object.is(undefined, undefined); // true
		// Object.is 主要用于确保比较的严格性，特别是在处理 NaN 和零值时。
		if (Object.is(prevDeps[i], nextDeps[i])) {
			continue;
		}
		return false;
	}
	// 全等返回true
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
	// 取到当前的fiber
	const fiber = currentlyRenderingFiber as FiberNode;
	// effect环状链表又保存在fiber.updateQueue中的lastEffect属性上
	const updateQueue = fiber.updateQueue as FCUpdateQueue<any>;
	if (updateQueue === null) {
		// 如果fiber上没有UpdateQueue
		// 则我们创建updateQueue
		const updateQueue = createFCUpdateQueue();
		fiber.updateQueue = updateQueue;
		// 第一个useEffect 跟自己构成环状链表
		effect.next = effect;
		// fc组件的updateQueue属性的lastEffect指向最后一个effect
		updateQueue.lastEffect = effect;
	} else {
		// updateQueue存在
		// 插入effect
		const lastEffect = updateQueue.lastEffect;
		if (lastEffect === null) {
			effect.next = effect;
			updateQueue.lastEffect = effect;
		} else {
			// fiber.updateQueue.lastEffect指向最后一个effect
			// 那么他的.next指向第一个effect

			// a->b->a
			// first: a
			const firstEffect = lastEffect.next;
			// b -> c (a -> b)
			lastEffect.next = effect;
			// c -> a (a -> b)
			effect.next = firstEffect;
			// 指向最后一个c
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

	// 计算新state的逻辑
	const queue = hook.updateQueue as UpdateQueue<State>;
	const pending = queue.shared.pending;
	// 计算完状态需要把update置空
	queue.shared.pending = null;

	if (pending !== null) {
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
	// 取出当前触发条件下的lane
	const lane = requestUpdateLane();
	// 创建更新
	const update = createUpdate<State>(action, lane);
	enqueueUpdate(updateQueue, update);
	scheduleUpdateOnFiber(fiber, lane);
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
