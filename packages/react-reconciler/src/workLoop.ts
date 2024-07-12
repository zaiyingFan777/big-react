import { scheduleMicroTask } from 'hostConfig';
import { beginWork } from './beginWork';
import {
	commitHookEffectListCreate,
	commitHookEffectListDestroy,
	commitHookEffectListUnmount,
	commitLayoutEffects,
	commitMutationEffects
} from './commitWork';
import { completeWork } from './completeWork';
import {
	createWorkInProgress,
	FiberNode,
	FiberRootNode,
	PendingPassiveEffects
} from './fiber';
import { MutationMask, NoFlags, PassiveMask } from './fiberFlags';
import {
	// getHighestPriorityLane,
	getNextLane,
	Lane,
	lanesToSchedulerPriority,
	markRootFinished,
	markRootSuspended,
	mergeLanes,
	NoLane,
	SyncLane
} from './fiberLanes';
import { flushSyncCallbacks, scheduleSyncCallback } from './syncTaskQueue';
import { HostRoot } from './workTags';
// 调度器
import {
	unstable_scheduleCallback as scheduleCallback,
	unstable_NormalPriority as NormalPriority,
	unstable_shouldYield,
	unstable_cancelCallback
} from 'scheduler';
import { HookHasEffect, Passive } from './hookEffectTags';
import { getSuspenseThenable, SuspenseException } from './thenable';
import { resetHooksOnUnwind } from './fiberHooks';
import { throwException } from './fiberThrow';
import { unwindWork } from './fiberUnwindWork';

// 内存中构建的dom树(最初是hostRootFiber)
let workInProgress: FiberNode | null = null;
// 本次更新的lane是什么
let wipRootRenderLane: Lane = NoLane;
// 防止副作用被多次调度
let rootDoesHasPassiveEffects = false;

type RootExitStatus = number;

// 工作中的状态
const RootInProgress = 0;
// 并发更新 中途打断
const RootInComplete: RootExitStatus = 1;
// render完成
const RootCompleted: RootExitStatus = 2;
// 由于挂起，当前是未完成的状态，不用进入commit阶段
const RootDidNotInComplete = 3;
// 全局状态(wip退出的状态)，默认为工作中的状态
let wipRootExitStatus: number = RootInProgress;

// Suspense
type SuspendedReason = typeof NotSuspended | typeof SuspendedOnData;
// 没挂起
const NotSuspended = 0;
// 请求数据导致的挂起
const SuspendedOnData = 1;
// suspense被挂起的原因
let wipSuspendedReason: SuspendedReason = NotSuspended;
let wipThrownValue: any = null;

// ReactDOM.createRoot(rootElement).render(<App/>)中的container与performSyncWorkOnRoot连接上
// 在fiber中调度update
export function scheduleUpdateOnFiber(fiber: FiberNode, lane: Lane) {
	// 调度功能
	// 首屏渲染：fiber hostRootFiber
	// 其他的更新：组件的fiber
	// 无论哪种情况我们需要从fiber向上遍历找到fiberRootNode

	// 得到fiberRootNode
	const root = markUpdateLaneFromFiberToRoot(fiber, lane);
	// 将lane记录到fiberRootNode的pendingLanes上
	markRootUpdated(root, lane);
	// 选出一个lane去更新
	ensureRootIsScheduled(root);
}

// 保证我们的root被调度
export function ensureRootIsScheduled(root: FiberRootNode) {
	// 选择当前最高优先级lane去调度(抛去被挂起的最高优先级的lane)
	const updateLane = getNextLane(root);
	// 获取当前的callbackNode
	const existingCallbackNode = root.callbackNode;

	if (updateLane === NoLane) {
		// 没有更新
		if (existingCallbackNode !== null) {
			// 没有要更新的任务，同时存在root.callbackNode，需要取消调度
			unstable_cancelCallback(existingCallbackNode);
		}
		root.callbackNode = null;
		root.callbackPriority = NoLane;
		return;
	}

	// 获取当前的优先级
	const curPriority = updateLane;
	// 获取上次更新的优先级
	const prevPriority = root.callbackPriority;

	if (curPriority === prevPriority) {
		// 前后优先级一致，不需要产生新的调度
		return;
	}

	// 前后优先级不一致，有更高优先级任务
	if (existingCallbackNode !== null) {
		// 取消当前优先级任务的调度
		unstable_cancelCallback(existingCallbackNode);
	}

	// 新的调度任务
	let newCallbackNode = null;

	if (__DEV__) {
		console.log(
			`在${updateLane === SyncLane ? '微' : '宏'}任务中调度，优先级：`,
			updateLane
		);
	}

	if (updateLane === SyncLane) {
		// 同步优先级是没有新的调度任务的
		// 同步优先级，用微任务调度
		// 将performSyncWorkOnRoot塞入到微任务队列中
		// 每次更新会执行scheduleUpdateOnFiber -> ensureRootIsScheduled -> performSyncWorkOnRoot放入微任务队列 -> scheduleMicroTask再去清空微任务队列
		// 但是：scheduleMicroTask调度flushSyncCallbacks的时候，我们定义了全局变量isFlushingSyncQueue为false，当开始调度的时候变为true，这时候后面两次任务进队列，然后总共执行三次render(但是我们的策略不会让他执行三次，见下面解释)，都是在同一次微任务中
		// 后面两次scheduleMicroTask执行的时候微任务队列isFlushingSyncQueue为true,不会再执行flushSyncCallbacks了
		// ps: setState三次函数是同步的，因此会执行scheduleUpdateOnFiber -> ensureRootIsScheduled -> performSyncWorkOnRoot放入微任务队列 -> scheduleMicroTask三次，数组会被塞入performSyncWorkOnRoot三次，
		// 但是scheduleMicroTask执行三次，只有第一次执行，因为isFlushingSyncQueue为false，后面两次都为True，但是队列中有三次performSyncWorkOnRoot，因此我们需要执行完一次performSyncWorkOnRoot后将root.pendingLane中移除同步优先级，
		// 并且performSyncWorkOnRoot方法中加入判断当前root的最高优先级是否为SyncLane，如果是则向下执行，如果不是则重新执行ensureRootIsScheduled，因为第一次执行performSyncWorkOnRoot后移除了同步优先级，后面两次已经变味了NoLane，
		// 因此就不会再往下执行了，实际只会执行第一次performSyncWorkOnRoot，如果是其他低优先级就重新调度低优先级。
		// 为什么scheduleMicroTask会被执行三次，因为scheduleMicroTask的callback是在微任务中执行的，因此js会接着执行同步代码，setState三次，scheduleUpdateOnFiber -> ensureRootIsScheduled -> performSyncWorkOnRoot放入微任务队列 -> scheduleMicroTask
		// 流程会同步执行三次。
		// 微任务队列：[performSyncWorkOnRoot, performSyncWorkOnRoot, performSyncWorkOnRoot]
		// 同步任务updateLane(1)，root.pendingLanes |= 1多少次都是1，然后我们getHighestPriorityLane取出来的仍然是1
		// 比如click里面setNum((count) => count+1)三次，那么这个fiber上的memoizedState属性的useState(num)hook的updateQueue属性上有一个环状链表（三个action）

		// 最终解释：scheduleUpdateOnFiber -> ensureRootIsScheduled -> performSyncWorkOnRoot放入微任务队列 -> scheduleMicroTask，三次setNum，这个过程是js同步代码会执行三次，但是flushSyncCallbacks被推到微任务中.then中执行，所以也会执行三次，但是
		// 我们定义了变量isFlushingSyncQueue，只有第一次flushSyncCallbacks才会执行内部逻辑。
		// 执行顺序，1.先执行三次scheduleUpdateOnFiber -> ensureRootIsScheduled -> performSyncWorkOnRoot放入微任务队列 -> scheduleMicroTas流程，
		// 2.再执行flushSyncCallbacks三次，3.再执行performSyncWorkOnRoot三次
		// [performSyncWorkOnRoot, performSyncWorkOnRoot, performSyncWorkOnRoot]会进入这个方法三次，但是第一次执行完把同步优先级lane消除掉，后面两次本质不会执行render阶段

		// 同步执行流程三次，flushSyncCallbacks分别被推到微任务中三次，然后微任务执行三次flushSyncCallbacks（防抖），数组函数执行三次（防抖）

		/**
		 * var test = (callback) => Promise.resolve(null).then(callback)
		 * function test2() {
		 *   console.log(1111)
		 * }
		 * test(test2)
		 * console.log('第一')
		 * test(test2)
		 * console.log('第二')
		 * test(test2)
		 * console.log('第三')
		 * 像上面所说的执行顺序：第一、第二、第三、1111(三次)
		 */

		scheduleSyncCallback(performSyncWorkOnRoot.bind(null, root));
		scheduleMicroTask(flushSyncCallbacks);
	} else {
		// 其他优先级，用宏任务调度
		// 获取优先级
		const schedulePriority = lanesToSchedulerPriority(updateLane);
		// 将lane转为优先级，然后以这种优先级去调度performConcurrentWorkOnRoot
		// 并发更新是有新的调度任务的
		newCallbackNode = scheduleCallback(
			schedulePriority,
			// @ts-ignore
			performConcurrentWorkOnRoot.bind(null, root)
		);
	}
	// 更新root上的callbackNode、callbackPriority
	// !!这里如果是同步任务，root.callbackNode会被赋值为null
	root.callbackNode = newCallbackNode;
	root.callbackPriority = curPriority;
}

// 在scheduleUpdateOnFiber阶段,将本次触发的更新的lane记录在fiberRootNode上
export function markRootUpdated(root: FiberRootNode, lane: Lane) {
	root.pendingLanes = mergeLanes(root.pendingLanes, lane);
}

// 从发起更新处的组件向上找到fiberRootNode
export function markUpdateLaneFromFiberToRoot(fiber: FiberNode, lane: Lane) {
	let node = fiber;
	let parent = node.return;

	// 普通fiber有return指向父节点，但是hostRootNode没有return，只有stateNode指向fiberRootNode
	while (parent !== null) {
		// 因为触发更新enqueueUpdate的时候，已经把lane附加到fiber.lanes上了，因此只需要冒泡到parent.childLanes
		// 触发更新需要把lane放到父级fiber.childLanes上 一步一步冒泡上去
		parent.childLanes = mergeLanes(parent.childLanes, lane);
		const alternate = parent.alternate;
		if (alternate !== null) {
			alternate.childLanes = mergeLanes(alternate.childLanes, lane);
		}

		// parent !== null，说明是个普通节点
		// 向上遍历，将parent赋值给node 将爸爸赋值给当前
		node = parent;
		// 将爷爷赋值给爸爸，一直向上遍历
		parent = node.return;
	}
	// 遇到hostRootFiber，会跳出上述循环，node为hostRootFiber, parent为null
	if (node.tag === HostRoot) {
		return node.stateNode;
	}
	return null;
}

// workInProgress指向我们需要遍历的第一个fiberNode
function prepareFreshStack(root: FiberRootNode, lane: Lane) {
	// root.current -> hostRootFiber
	// 首屏渲染
	// 因为第一次hostRootFiber被初始化了，所以wip(hostRootFiber)有current
	// 创建root.current(hostRootFiber)的wip
	root.finishedLane = NoLane;
	root.finishedWork = null;
	workInProgress = createWorkInProgress(root.current, {});
	wipRootRenderLane = lane;
	// 退出状态修改为 工作中
	wipRootExitStatus = RootInProgress;
	// 重置 为没有进入suspense中
	wipSuspendedReason = NotSuspended;
	// 重置
	wipThrownValue = null;
}

// 并发更新
function performConcurrentWorkOnRoot(
	root: FiberRootNode,
	didTimeout: boolean
): any {
	// !!!并发更新开始的时候要保证useEffect的回调都已经执行过了
	// 因为useEffect的回调中可能会触发更新，如果优先级很高，高过了当前调度的优先级，显然当前更新的优先级会被打断，然后开始这个更高优先级的调度
	// 因此需要保证useEffect回调执行
	// function App() {
	// 	useEffect(() => {
	// 		updateState(xxx)
	// 	})
	// }
	// 保留这次更新的callback
	const curCallback = root.callbackNode;
	// useEffect的回调是否已经被执行，执行了为true，没有执行为false
	const didFlushPassiveEffect = flushPassiveEffects(root.pendingPassiveEffects);
	if (didFlushPassiveEffect) {
		// 执行了副作用，有可能触发更新，创建了新的callbackNode，需要判断执行完回调后的callbackNode与curCallback是否相同
		// 如果会产生新的高优先级，ensureRootIsScheduled里面会对root.callbackNode重新赋值新的调度函数。
		if (root.callbackNode !== curCallback) {
			// 执行副作用有了新的更新，需要暂听此次的performConcurrentWorkOnRoot
			// 这里就说明，在执行performConcurrentWorkOnRoot的时候我们在执行初期先保证useEffect的回调执行完，并且useEffect执行完后发现有新的更新产生了更高级别的优先级，
			// 比当前调度的performConcurrentWorkOnRoot的优先级更高。因此当前调度被暂停
			return null;
		}
	}

	// 获取非被挂起的最高优先级的lane
	const lane = getNextLane(root);
	// 保留当前的callbackNode
	const curCallbackNode = root.callbackNode;
	if (lane === NoLane) {
		return null;
	}
	// 需要同步执行: 1.SyncLane 2.didTimeout(饥饿问题：如果有个work他的优先级竞争不过别人，他就一直不执行一直不执行。这样他的优先级就会越来越高越来越高直到任务过期，需要同步执行，不可以中断)
	const needSync = lane === SyncLane || didTimeout;
	// render阶段
	const exitStatus = renderRoot(root, lane, !needSync);

	// 调度一下，看是否有更高级别的更新
	// 放在下面
	// ensureRootIsScheduled(root);

	// 退出状态
	switch (exitStatus) {
		case RootInComplete:
			// 中断
			if (root.callbackNode !== curCallbackNode) {
				// 两次更新优先级不一致，返回null，不要再调度上一次的优先级的任务
				return null;
			}
			// 经过ensureRootIsScheduled之后，前后优先级是一致的，继续调度当前优先级任务
			// 对于中断的情况，直接返回performConcurrentWorkOnRoot供下次时间切片
			return performConcurrentWorkOnRoot.bind(null, root);
		case RootCompleted:
			// 更新完成了
			// 获得完成更新流程的wip树
			const finishedWork = root.current.alternate; // fiberRootNode.alternate
			root.finishedWork = finishedWork;
			root.finishedLane = lane; // 保存本次消费的lane
			// 重置
			wipRootRenderLane = NoLane;
			// wip fiberNode树 树中的flags
			commitRoot(root);
			break;
		case RootDidNotInComplete:
			// 重置
			wipRootRenderLane = NoLane;
			// suspense被挂起
			// 标记root 挂起状态lane，并且在pendingLanes中移除被挂起的lane
			markRootSuspended(root, lane);
			// 由于挂起，当前是未完成的状态，不用进入commit阶段
			// 那么就重新调度一下
			ensureRootIsScheduled(root);
			break;
		default:
			if (__DEV__) {
				console.error('还未实现的并发更新结束状态');
			}
			break;
	}
}

// render阶段更新流程(递、归)
// 触发更新的几种方式
// ReactDOM.createRoot().render（或老版的ReactDOM.render）
// this.setState
// useState的dispatch方法
function performSyncWorkOnRoot(root: FiberRootNode) {
	// 同步任务防止被重复调用
	// 获取非挂起的最高优先级的lane
	const nextLane = getNextLane(root);
	if (nextLane !== SyncLane) {
		// 批处理
		// 1.其他比SyncLane低的优先级
		// 2.NoLane
		ensureRootIsScheduled(root);
		return;
	}

	// if (__DEV__) {
	// 	console.log('render阶段开始');
	// }

	const exitStatus = renderRoot(root, nextLane, false);

	switch (exitStatus) {
		case RootCompleted:
			// 完成
			// 获得完成更新流程的wip树
			const finishedWork = root.current.alternate; // fiberRootNode.alternate
			root.finishedWork = finishedWork;
			root.finishedLane = nextLane; // 保存本次消费的lane
			// 重置
			wipRootRenderLane = NoLane;
			// wip fiberNode树 树中的flags
			commitRoot(root);
			break;
		case RootDidNotInComplete:
			// 挂起，重置一些变量
			wipRootRenderLane = NoLane;
			// 标记root 挂起状态lane
			markRootSuspended(root, nextLane);
			// 重新调度
			ensureRootIsScheduled(root);
			break;
		default:
			if (__DEV__) {
				console.error('还未实现的同步更新结束状态');
			}
			break;
	}
}

// render通用阶段（并发更新、同步更新）
function renderRoot(root: FiberRootNode, lane: Lane, shouldTimeSlice: boolean) {
	if (__DEV__) {
		console.log(`开始${shouldTimeSlice ? '并发' : '同步'}更新`, root);
	}

	// 并发更新由于会中断，所以没必要每次都初始化，只有当wipRootRenderLane !== lane的时候才需要初始化
	if (wipRootRenderLane !== lane) {
		// 初始化
		prepareFreshStack(root, lane);
	}
	/**
	 * JavaScript 中的 do...while 循环是一种后测试循环，这意味着它会首先执行循环体，然后在每次迭代后检查条件是否为真。
	 * 只要条件为真，循环就会继续执行。即使条件从一开始就为假，do...while 循环也会至少执行一次。
	 */

	do {
		try {
			if (wipSuspendedReason !== NotSuspended && workInProgress !== null) {
				// suspense挂起状态
				// 是否进入unwind流程
				const thrownValue = wipThrownValue;
				// 重置wipSuspendedReason为没有挂起
				wipSuspendedReason = NotSuspended;
				wipThrownValue = null;
				// 进入unwind流程
				throwAndUnwindWorkLoop(root, workInProgress, thrownValue, lane);
			}

			// shouldTimeSlice为true代表开启时间切片
			shouldTimeSlice ? workLoopConcurrent() : workLoopSync();
			break;
		} catch (e) {
			if (__DEV__) {
				console.warn('workLoop发生错误', e);
			}
			// 执行use[hook]的时候会抛出异常，进入catch，中断了beginwork流程，然后进行一系列标记等操作，然后下一次render的时候会进入unwind流程（throwAndUnwindWorkLoop），1.重置一些全局变量，
			// 2.将Promise挂起存到root.pingCache，然后等promise完成后执行ping(重新将上次挂起的优先级发起render操作)3.unwind流程回滚到suspense组件去beginwork fallback组件
			// 捕获错误，然后下次do while循环继续执行就会遇到上述判断是否挂起状态的逻辑
			handleThrow(root, e);
			// workInProgress = null;
		}
	} while (true);

	if (wipRootExitStatus !== RootInProgress) {
		// 没有在工作中，被挂起 (unwind)
		return wipRootExitStatus;
	}

	// 中断执行
	if (shouldTimeSlice && workInProgress !== null) {
		return RootInComplete;
	}
	// render阶段执行完
	if (!shouldTimeSlice && workInProgress !== null && __DEV__) {
		console.error('render阶段结束时wip不应该不是null');
	}
	// TODO报错
	// render阶段执行完
	return RootCompleted;
}

// 遇到use抛出错误，并unwind流程
function throwAndUnwindWorkLoop(
	root: FiberRootNode,
	unitOfWork: FiberNode, // 当前挂起的fiber节点
	thrownValue: any, // 抛出的值
	lane: Lane // 优先级
) {
	// unwind前的重置hook，避免 hook0 use hook1 时 use造成中断，再恢复时前后hook对应不上

	// 重置FC全局变量
	resetHooksOnUnwind();
	// 请求返回后重新触发更新
	throwException(root, thrownValue, lane);
	// unwind流程，从抛出错误的unitOfWork进行到离我们最近的suspense(用栈的结构来保存)。从抛出错误的组件先找到离这个组件最近的suspense，标记shouldCapture，然后再开启unwind流程向上一级一级的找直到找到标记shouldCapture的suspense
	// 然后将shouldCapture修改为didCapture，再开启suspense beginwork
	unwindUnitOfWork(unitOfWork);
}

// 从unitOfWork向上走找到第一个标记shouldCapture的suspense
function unwindUnitOfWork(unitOfWork: FiberNode) {
	let incompleteWork: FiberNode | null = unitOfWork;

	do {
		const next = unwindWork(incompleteWork);

		if (next !== null) {
			// 找到了最近的suspense，那么接下来beginwork的起点就是workInProgress
			workInProgress = next;
			return;
		}

		// 没找到接着向上找
		const returnFiber = incompleteWork.return as FiberNode;
		if (returnFiber !== null) {
			// 因为是unwind流程，将之前标记的副作用清除。
			returnFiber.deletions = null;
		}
		incompleteWork = returnFiber;
	} while (incompleteWork !== null);

	// 走到这里，说明使用了use，抛出了data，但是没有定义suspense
	// 说明使用use hook的组件，没有被suspense包裹住（没有定义suspense）
	wipRootExitStatus = RootDidNotInComplete; // 没有在工作中
	workInProgress = null;
}

// 处理render函数中抛出的错误
function handleThrow(root: FiberRootNode, throwValue: any) {
	// Errir Boundary

	if (throwValue === SuspenseException) {
		throwValue = getSuspenseThenable();
		// 赋值suspense挂起的原因
		wipSuspendedReason = SuspendedOnData;
	} else {
		// TODO Error Boundary
	}
	wipThrownValue = throwValue;
}

// render阶段
// beginWork
// completeWork
// 不可中断的workLoop
function workLoopSync() {
	while (workInProgress !== null) {
		performUnitOfWork(workInProgress);
	}
}

// 可中断的workLoop
function workLoopConcurrent() {
	// unstable_shouldYield为false不能被中断，为true才可以中断（事件切片不够了）
	while (workInProgress !== null && !unstable_shouldYield()) {
		performUnitOfWork(workInProgress);
	}
}

function performUnitOfWork(fiber: FiberNode) {
	// next: 子fiber或者null
	const next = beginWork(fiber, wipRootRenderLane);
	// 工作完成后赋值memoizedProps
	fiber.memoizedProps = fiber.pendingProps;
	// dfs 1:有子节点一直遍历子节点，没有则completeUnitOfWork
	if (next === null) {
		// 归
		completeUnitOfWork(fiber);
	} else {
		workInProgress = next;
	}
}

function completeUnitOfWork(fiber: FiberNode) {
	// dfs 2: 没子节点遍历兄弟节点
	let node: FiberNode | null = fiber;

	do {
		completeWork(node);
		const sibling = node.sibling;
		// 有兄弟节点继续遍历兄弟节点
		if (sibling !== null) {
			workInProgress = sibling;
			return;
		}
		// 没兄弟节点，往上遍历（归）
		node = node.return;
		workInProgress = node;
	} while (node !== null);
}

// ------------------------------------------------------------分割线------------------------------------------------------------

// commit阶段分为：
// beforeMutation阶段
// mutation阶段
// layout阶段
function commitRoot(root: FiberRootNode) {
	// render完成后的wip(fiberRootNode)
	const finishedWork = root.finishedWork;

	if (finishedWork === null) {
		return;
	}

	if (__DEV__) {
		console.warn('commit阶段开始', finishedWork);
	}
	const lane = root.finishedLane;

	if (lane === NoLane && __DEV__) {
		console.error('commit阶段finishedLane不应该是NoLane');
	}

	// 重置操作，root.finishedWork = null，root.finishedWork已经被保存在finishedWork中了
	root.finishedWork = null;
	root.finishedLane = NoLane;

	// pendingLanes移除本次更新的优先级
	markRootFinished(root, lane);

	// 调度副作用
	if (
		(finishedWork.flags & PassiveMask) !== NoFlags ||
		(finishedWork.subtreeFlags & PassiveMask) !== NoFlags
	) {
		// 当前fiber树中 存在函数组件需要执行useEffect回调的
		if (!rootDoesHasPassiveEffects) {
			// 防止多次执行commitRoot多次调度副作用
			rootDoesHasPassiveEffects = true;
			// 调度副作用，通过scheduleCallback按照NormalPriority的优先级来调度回调函数(第二个参数，这个回调函数会在setTimeout里面被调度)
			// 这里是异步操作，因此同步代码(commitRoot)先执行，执行完才会执行这里第二个参数(回调函数) 执行副作用
			scheduleCallback(NormalPriority, () => {
				// 执行副作用
				// 收集依赖是在Mutation中，因为这里是被异步调度，所以能够拿到root.pendingPassiveEffects
				flushPassiveEffects(root.pendingPassiveEffects);
				return;
			});
		}
	}

	// 判断是否存在三个子阶段需要执行的操作
	// root flags、root subtreeFlags
	const subtreeHasEffect =
		(finishedWork.subtreeFlags & (MutationMask | PassiveMask)) !== NoFlags;
	const rootHasEffect =
		(finishedWork.flags & (MutationMask | PassiveMask)) !== NoFlags;

	if (subtreeHasEffect || rootHasEffect) {
		// beforeMutation阶段
		// mutation阶段
		commitMutationEffects(finishedWork, root);
		// fiber树切换在mutation和layout之间
		root.current = finishedWork;

		// layout阶段，执行layout阶段的时候，wip fiber已经变为了current fiber
		commitLayoutEffects(finishedWork, root);
	} else {
		// 没有更新也需要执行树切换的操作
		root.current = finishedWork;
	}

	// 重置rootDoesHasPassiveEffects
	rootDoesHasPassiveEffects = false;
	// 重新调度
	ensureRootIsScheduled(root);
	console.log(root.current);
}

// 执行effect回调
// 本次更新的任何create回调都必须在所有上一次更新的destroy回调执行完后再执行。
function flushPassiveEffects(pendingPassiveEffects: PendingPassiveEffects) {
	// 判断当前是否有回调被执行，执行了设置为true
	let didFlushPassiveEffect = false;

	// 1.遍历effect
	// 2.首先触发所有unmount effect，且对于某个fiber，如果触发了unmount destroy，本次更新不会再触发update create[commitHookEffectListUnmount]
	pendingPassiveEffects.unmount.forEach((effect) => {
		didFlushPassiveEffect = true;
		// 卸载
		commitHookEffectListUnmount(Passive, effect);
	});
	// 置空pendingPassiveEffects.unmount
	pendingPassiveEffects.unmount = [];
	// 3.触发所有上次更新的destroy
	pendingPassiveEffects.update.forEach((effect) => {
		didFlushPassiveEffect = true;
		// effect.tag需要是Passive 以及 HookHasEffect才会触发destroy
		// 因此对于虽然是useEffect但是没有标记HookHasEffect的，他就【不会执行触发destroy的操作】
		commitHookEffectListDestroy(Passive | HookHasEffect, effect);
	});

	// 4.触发所有这次更新的create
	pendingPassiveEffects.update.forEach((effect) => {
		didFlushPassiveEffect = true;
		commitHookEffectListCreate(Passive | HookHasEffect, effect);
	});

	pendingPassiveEffects.update = [];

	// 回调中可能有setState，需要执行更新
	flushSyncCallbacks();
	return didFlushPassiveEffect;
}
