import { scheduleMicroTask } from 'hostConfig';
import { beginWork } from './beginWork';
import {
	commitHookEffectListCreate,
	commitHookEffectListDestroy,
	commitHookEffectListUnmount,
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
	getHighestPriorityLane,
	Lane,
	markRootFinished,
	mergeLanes,
	NoLane,
	SyncLane
} from './fiberLanes';
import { flushSyncCallbacks, scheduleSyncCallback } from './syncTaskQueue';
import { HostRoot } from './workTags';
// 调度器
import {
	unstable_scheduleCallback as scheduleCallback,
	unstable_NormalPriority as NormalPriority
} from 'scheduler';
import { HookHasEffect, Passive } from './hookEffectTags';

// 内存中构建的dom树(最初是hostRootFiber)
let workInProgress: FiberNode | null = null;
// 本次更新的lane是什么
let wipRootRenderLane: Lane = NoLane;
// 防止副作用被多次调度
let rootDoesHasPassiveEffects: Boolean = false;

// ReactDOM.createRoot(rootElement).render(<App/>)中的container与performSyncWorkOnRoot连接上
// 在fiber中调度update
export function scheduleUpdateOnFiber(fiber: FiberNode, lane: Lane) {
	// 调度功能
	// 首屏渲染：fiber hostRootFiber
	// 其他的更新：组件的fiber
	// 无论哪种情况我们需要从fiber向上遍历找到fiberRootNode

	// 得到fiberRootNode
	const root = markUpdateFromFiberToRoot(fiber);
	// 将lane记录到fiberRootNode的pendingLanes上
	markRootUpdated(root, lane);
	// 选出一个lane去更新
	ensureRootIsScheduled(root);
}

// 保证我们的root被调度
function ensureRootIsScheduled(root: FiberRootNode) {
	// 选择当前最高优先级lane去调度
	const updateLane = getHighestPriorityLane(root.pendingLanes);
	if (updateLane === NoLane) {
		// 没有更新
		return;
	}
	if (updateLane === SyncLane) {
		// 同步优先级，用微任务调度
		if (__DEV__) {
			console.log('在微任务中调度，优先级：', updateLane);
		}
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

		scheduleSyncCallback(performSyncWorkOnRoot.bind(null, root, updateLane));
		scheduleMicroTask(flushSyncCallbacks);
	} else {
		// 其他优先级，用宏任务调度
	}
}

// 在scheduleUpdateOnFiber阶段,将本次触发的更新的lane记录在fiberRootNode上
function markRootUpdated(root: FiberRootNode, lane: Lane) {
	root.pendingLanes = mergeLanes(root.pendingLanes, lane);
}

// 从发起更新处的组件向上找到fiberRootNode
function markUpdateFromFiberToRoot(fiber: FiberNode) {
	let node = fiber;
	let parent = node.return;

	// 普通fiber有return指向父节点，但是hostRootNode没有return，只有stateNode指向fiberRootNode
	while (parent !== null) {
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
	workInProgress = createWorkInProgress(root.current, {});
	wipRootRenderLane = lane;
}

// render阶段更新流程(递、归)
// 触发更新的几种方式
// ReactDOM.createRoot().render（或老版的ReactDOM.render）
// this.setState
// useState的dispatch方法
function performSyncWorkOnRoot(root: FiberRootNode, lane: Lane) {
	// 同步任务防止被重复调用
	const nextLane = getHighestPriorityLane(root.pendingLanes);
	if (nextLane !== SyncLane) {
		// 1.其他比SyncLane低的优先级
		// 2.NoLane
		ensureRootIsScheduled(root);
		return;
	}

	if (__DEV__) {
		console.log('render阶段开始');
	}

	// 初始化
	prepareFreshStack(root, lane);
	/**
	 * JavaScript 中的 do...while 循环是一种后测试循环，这意味着它会首先执行循环体，然后在每次迭代后检查条件是否为真。
	 * 只要条件为真，循环就会继续执行。即使条件从一开始就为假，do...while 循环也会至少执行一次。
	 */

	do {
		try {
			workLoop();
			break;
		} catch (e) {
			if (__DEV__) {
				console.warn('workLoop发生错误', e);
			}
			workInProgress = null;
		}
	} while (true);

	// 获得完成更新流程的wip树
	const finishedWork = root.current.alternate; // fiberRootNode.alternate
	root.finishedWork = finishedWork;
	root.finishedLane = lane; // 保存本次消费的lane
	// 重置
	wipRootRenderLane = NoLane;

	// wip fiberNode树 树中的flags
	commitRoot(root);
}

// render阶段
// beginWork
// completeWork
function workLoop() {
	while (workInProgress !== null) {
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

		// layout阶段
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
	// 1.遍历effect
	// 2.首先触发所有unmount effect，且对于某个fiber，如果触发了unmount destroy，本次更新不会再触发update create[commitHookEffectListUnmount]
	pendingPassiveEffects.unmount.forEach((effect) => {
		// 卸载
		commitHookEffectListUnmount(Passive, effect);
	});
	// 置空pendingPassiveEffects.unmount
	pendingPassiveEffects.unmount = [];
	// 3.触发所有上次更新的destroy
	pendingPassiveEffects.update.forEach((effect) => {
		// effect.tag需要是Passive 以及 HookHasEffect才会触发destroy
		// 因此对于虽然是useEffect但是没有标记HookHasEffect的，他就【不会执行触发destroy的操作】
		commitHookEffectListDestroy(Passive | HookHasEffect, effect);
	});

	// 4.触发所有这次更新的create
	pendingPassiveEffects.update.forEach((effect) => {
		commitHookEffectListCreate(Passive | HookHasEffect, effect);
	});

	pendingPassiveEffects.update = [];

	// 回调中可能有setState，需要执行更新
	flushSyncCallbacks();
}
