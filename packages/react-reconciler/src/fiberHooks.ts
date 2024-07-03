import internals from 'shared/internals';
import { FiberNode } from './fiber';
import { Dispatch, Dispatcher } from 'react/src/currentDispatcher';
import currentBatchConfig from 'react/src/currentBatchConfig';
import {
	createUpdate,
	createUpdateQueue,
	enqueueUpdate,
	processUpdateQueue,
	Update,
	UpdateQueue
} from './updateQueue';
import { Action, ReactContext } from 'shared/ReactTypes';
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
// 每个hook(useState)中的类型为Hook类型里面又有memoizedState字段，Hook保存的是useState或useEffect(effect)自身的值，
// 对于useTransition来说，memoizedState存储的是startTransition函数。
// 对于useRef来说，memoizedState存储的是ref数据结构
interface Hook {
	memoizedState: any;
	updateQueue: unknown;
	next: Hook | null;
	// baseState、baseQueue为useState中所需要的字段
	baseState: any;
	baseQueue: Update<any> | null;
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
	useEffect: mountEffect,
	useTransition: mountTransition,
	useRef: mountRef,
	useContext: readContext
};

const HooksDispatcherOnUpdate: Dispatcher = {
	useState: updateState,
	useEffect: updateEffect,
	useTransition: updateTransition,
	useRef: updateRef,
	useContext: readContext
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

// 多次中断多次执行updateState函数，那么只要没commit我们之前render的update需要保存在current fiber hook的baseQueue中
function updateState<State>(): [State, Dispatch<State>] {
	// 找到当前useState对应的hook数据
	const hook = updateWorkInProgressHook();

	// 计算新state的逻辑
	const queue = hook.updateQueue as UpdateQueue<State>;
	// baseState 是本次更新参与计算的初始 state
	const baseState = hook.baseState;

	const pending = queue.shared.pending;
	// currentHook
	const current = currentHook as Hook;
	// 我们会把render的update结果存放在current fiber的hook上
	let baseQueue = current.baseQueue;

	// 拼接baseQueue
	if (pending !== null) {
		// 防止多次render 不同优先级下计算的update丢失因此需要保存，以供下次计算时使用
		// pending、baseQueue update保存在current中
		if (baseQueue !== null) {
			// baseQueue b2->b0->b1->b2
			// pendingQueue p2->p0->p1->p2
			// b0
			const baseFirst = baseQueue.next;
			// p0
			const pendingFirst = pending.next;

			// 将baseQueue和pendingQueue连接起来
			// b2->p0
			baseQueue.next = pendingFirst;
			// p2->b0
			pending.next = baseFirst;
			// p2->b0->b1->b2->p0->p1->p2
		}
		// 如果baseQueue为null，那说明首次render，那么将pending赋值给baseQueue
		// 如果baseQueue不为Null，我们上面将baseQueue和pendingQueue连接起来的结果赋值给baseQueue
		baseQueue = pending;
		// 将生成的环状链表保存在current中
		current.baseQueue = pending;
		// 这里可能会用到note.md中的15.1
		// 如果是低优先级的被高优先级打断，我们低优先级的时候先将pending保存在了current.baseQueue中了(无论计算不计算都会保留完整的updateQueue，并且baseState我们没存，因此只要低优先级被打断，都会重新计算)，然后将queue.shared.pending置空（因为queue是使用的currentfiber的queue，那么current和wip的hook queue都会被清空，）
		// 但是如果高优先级的任务进来了这时候queue又有值了，然后重新render这个函数组件，我们会从current.baseQueue中拿到basequeue，以及新进来的Pending组成新的链表(两次优先级action的链表)。并保存在current中，
		// 这样才会有后续的processUpdateQueue中的第一次render、第二次render 同时兼顾优先级和连贯性。
		// hook.baseQueue = newBaseQueue;说明可能是为了后续某些情况，比如高优先级的一批处理完了(commitRoot了)，低优先级的某一批没有被处理，但是结果需要兼顾连续性和优先级，因此需要接着上面的处理结果再去处理。
		// 因此下面中hook(wip)上存了baseQueue。然后wip变成了current，然后再计算的时候从current.baseQueue取出来，然后使用baseState作为新计算的初始值来计算。
		// 1.先发起同步优先级再发起低优先级，然后同一个hook先有高，再有低的链表，执行完高的，低的被跳过，依然将低的保存在新的hook上的basequeue，pending为空，等commit完成之后再重新调度低优先级，拿出啦hook的basequeue，
		// 2.如果是先发起低优先级再发起同步优先级，hook先进来低优先级的update开始render，然后这个hook又进来了高优先级的update，那么低优先级的render 完事后记录到current.basequeue因为没有执行fiber的切换，然后因为render低的没完就被打断了，进行高优先级，然后根据pending和basequeue重新计算，计算完记录到basequeue，进入到commit，然后再重新调度低优先级是根据basequeue
		// 并发更新，只要没有更高的打断他也会把这个lane更新完进入commit然后再重新进入调度更低的更新。
		// 3.如果低优先级正在执行，会将低优先级的pending赋值给baseQueue,因为baseQueue为Null，然后将baseQueue赋值给current.baseQueue，这时候低优先级render完了，但是还没有进入commit阶段，
		// 高优先级来了还是这个Hook，那么这个hook.pending来了高优先级的update，那么会拼接链表，将拼接好的链表赋值给current.baseQueue，然后baseState依然是最初的baseState【因为低优先级的计算完状态baseState存到了wip hook，但是不影响，我们从最初组件的状态开始计算，无非就是update链表的拼接，baseState是Hook最初的state，baseQueue是低优先级的Update和新的高优先级Update拼接好d的新链表，重构新计算高优先级，虽然低优先级的计算过了但是
		// baseState是hook最初的因为低优先级的计算了但是我们没有保存到cur，只是保存到了wip hook，没事相当于重新计算一边呗。计算完高优先级，commit，再计算低优先级。】，
		// 因为低优先级render完的计算结果存到了wip hook，
		// 但其实是不影响，因为baseState是最初的状态，baseQueue是拼接好的低、高优先级的链表，没有谁被跳过的，然后开始执行render，高优先级执行完，低优先级被跳过，计算出了baseState、memoState，被跳过的组成了新的baseQueue，然后
		// 执行commitRoot，wip变为了current，紧接着接着调度，再到这里的时候baseState是上次计算的，baseQueue是上次跳过的，pending为null，我们进入计算，计算完baseQueue也为Null,baseState、memoState也是新计算出来的。
		// 4.如果低优先级的组件的hook还没有开始render到就被打断了（可能上面的组件render完了，还没轮到它），其实新的更新pending会进入到pendingQueue，跟老的构成环状链表，紧接着执行完高优先级的，跳过低的将低的存到wip basequeue，计算出来的baseState也会被存起来wip hook，进入commit再重新调度低的, fiber树切换，从current树basequeue中恢复过来重新计算（baseState也是上次计算后的结果），
		// 5.等所有的更新执行完hook的baseQueue就为空了然后baseState、memoState也是相同的状态
		// 6.只要没有更高优先级的打断执行完本次render就会进入commitroot，然后开启下一次调度流程。
		// 7.总结，如果低优先级被打断，但是低优先级的pendingQueue存到了current fiber的baseQueue了，那么高优先级进来，会跟低优先级的update组成环状链表，计算完高优先级，因为还有剩下的没有被处理的更新，我们存到wip hook.baseQueue，执行完commit root
		// wip 变为 current，然后开始render低优先级，然后再从current.baseQueue中恢复出来上次遗留的updateQueue。

		queue.shared.pending = null; // 重置pendingQueue，
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
		updateQueue: currentHook.updateQueue,
		baseQueue: currentHook.baseQueue,
		baseState: currentHook.baseState
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
	// 因为所有的计算都是根据baseState开始的，memoizedState存储的计算后的状态
	hook.baseState = memoizedState;

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

// const [isPending, startTransition] = useTransition();
// startTransition(() => {
// 	update(xxx) // 这里的更新是transitionLane
// })
// mount时期的useTransition  具体解释见note.md中的##17
// 返回的第一个参数：是否在过渡过程中，第二个参数：startTransition
function mountTransition(): [boolean, (callback: () => void) => void] {
	// 第一个hook useState
	const [isPending, setPending] = mountState(false);
	// 第二个hook
	const hook = mountWorkInProgressHook();
	const start = startTransition.bind(null, setPending);
	hook.memoizedState = start;
	return [isPending, start];
}

// update时期的useTransition
function updateTransition(): [boolean, (callback: () => void) => void] {
	const [isPending] = updateState();
	const hook = updateWorkInProgressHook();
	const start = hook.memoizedState;
	return [isPending as boolean, start];
}
// callback为开发者传进来的回调函数
function startTransition(setPending: Dispatch<boolean>, callback: () => void) {
	// 第一次改变优先级为同步优先级
	setPending(true);
	// 第二次改变优先级到transitionLane
	// 先保存当前的transition，（从共享层中拿到）
	const preTransition = currentBatchConfig.transition;
	// 修改值为1，说明我们进入了transition
	currentBatchConfig.transition = 1;

	// 都是在transitionlane下调用，这里callback的setState的dispatch会获取优先级，然后我们的requestUpdateLane会做transition的判断，如果是transition会返回transitionLane
	callback();
	setPending(false);

	// 第三次改变优先级，还原优先级
	currentBatchConfig.transition = preTransition;
}

// mount时期的useRef
// const ref = useRef(null)
function mountRef<T>(initialValue: T): { current: T } {
	const hook = mountWorkInProgressHook();
	const ref = {
		current: initialValue
	};
	hook.memoizedState = ref;

	return ref;
}

function updateRef<T>(initialValue: T): { current: T } {
	const hook = updateWorkInProgressHook();
	return hook.memoizedState;
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
		next: null,
		baseQueue: null,
		baseState: null
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

// const x = useContext(ctx)
function readContext<T>(context: ReactContext<T>): T {
	// 消费者为当前正在工作的fiebr
	const consumer = currentlyRenderingFiber;
	if (consumer === null) {
		// 脱离了函数组件的使用
		// throw new Error('useContext must be inside a function component');
		throw new Error('只能在函数组件中调用useContext');
	}

	const value = context._currentValue;
	return value;
}
