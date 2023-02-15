// 完整的工作循环，调用beginWork和completeWork
import { scheduleMicroTask } from 'hostConfig';
import { beginWork } from './beginWork';
import {
	commitHookEffectListCreate,
	commitHookEffectListDestory,
	commitHookEffectListUnmount,
	commitMutationEffects
} from './commitWork';
import { completeWork } from './completeWork';
import {
	FiberNode,
	FiberRootNode,
	PendingPassiveEffects,
	createWorkInProgress
} from './fiber';
import { MutationMask, NoFlags, PassiveMask } from './fiberFlags';
import {
	Lane,
	NoLane,
	SyncLane,
	getHighestPriorityLane,
	markRootFinished,
	mergeLanes
} from './fiberLanes';
import { flushSyncCallbacks, scheduleSyncCallback } from './syncTaskQueue';
import { HostRoot } from './workTags';
import {
	unstable_scheduleCallback as scheduleCallback,
	unstable_NormalPriority as NormalPriority // 优先级
} from 'scheduler';
import { HookHasEffect, Passive } from './hookEffectTags';

// 全局的指针指向当前正在工作的fiberNode
let workInProgress: FiberNode | null = null;
// 保存：本次更新的lane是什么
let wipRootRenderLane: Lane = NoLane;
// 控制commitRoot阶段调度副作用的变量
let rootDoesHasPassiveEffect = false;

// 执行初始化的操作
function prepareFreshStack(root: FiberRootNode, lane: Lane) {
	// FiberRootNode不是一个普通的fiberNode不能直接当作workInProgress，因此需要一个方法将fiberRootNode变为fiberNode
	// 为我们的hostRootFiber创建一个workInProgress
	workInProgress = createWorkInProgress(root.current, {});
	wipRootRenderLane = lane;
}

// 连接ReactDOM.createRoot().render()中的render调用的updateContainer方法与renderRoot方法
// !!!每次更新都会触发scheduleUpdateOnFiber函数,
// !!!ps: 如果我们在一次click事件中，调用三次setNum((num) => num + 1);这时候会将performSyncWorkOnRoot方法放到syncQueue中三次，也就是数组中有三个performSyncWorkOnRoot，因为scheduleMicroTask
// 是微任务，所以是异步的，先执行同步，因此会第一次setNum((num) => num + 1)将performSyncWorkOnRoot放到数组中，执行scheduleMicroTask进入微任务队列，这是异步，然后接着执行setNum((num) => num + 1);
// 然后再将performSyncWorkOnRoot放到数组中，执行scheduleMicroTask进入微任务队列，然后第三次执行setNum((num) => num + 1)再将performSyncWorkOnRoot放到数组中，然后同步任务完成后，执行flushSyncCallbacks方法(微任务)，起了三次微任务
// 但是我们第一次的时候才会清空syncQueue数组，然后，执行performSyncWorkOnRoot函数，在render阶段完成后(计算state的时候，环状链表执行完计算出三次setState的结果)，在commit的时候，将root.pendingLanes &= ~lane，将这次执行的任务(同步Lane)
// 移除掉，因此下两次的performSyncWorkOnRoot函数里再取优先级就已经没有了，也不会执行了，因此setState三次，取出同步Lane只执行一次performSyncWorkOnRoot。如果有其他的优先级就调度其他的优先级了
export function scheduleUpdateOnFiber(fiber: FiberNode, lane: Lane) {
	// TODO调度功能
	// 1.首屏渲染传进来的时hostRootFiber，2.对于其他更新流程传入的是class component或者function component对应的fiber

	// 根据当前fiber一直往上遍历到 fiberRootNode
	// 拿到fiberRootNode
	const root = markUpdateFromFiberToRoot(fiber);
	markRootUpdated(root, lane);
	ensureRootIsScheduled(root);
}

// schedule阶段入口（保证我们的root被调度）
function ensureRootIsScheduled(root: FiberRootNode) {
	// 获取当前优先级最高的的lane
	const updateLane = getHighestPriorityLane(root.pendingLanes);
	if (updateLane === NoLane) {
		// NoLane代表了当前root.pendingLanes没有lane,就对应的没有Update更新
		return;
	}
	if (updateLane === SyncLane) {
		// 同步优先级 用微任务调度
		if (__DEV__) {
			console.log('在微任务中调度，优先级：', updateLane);
		}
		// 比如下面的点击事件会触发三个更新
		// const onClick = () => {
		// 	// 创建3个update
		// 	updateCount((count) => count + 1);
		// 	updateCount((count) => count + 1);
		// 	updateCount((count) => count + 1);
		// };
		// 每触发一次更新数组多一个回调
		// 得到[performSyncWorkOnRoot, performSyncWorkOnRoot, performSyncWorkOnRoot]
		// 每次更行都会将performSyncWorkOnRoot放到数组里[performSyncWorkOnRoot, performSyncWorkOnRoot]
		scheduleSyncCallback(performSyncWorkOnRoot.bind(null, root, updateLane));
		// 会在微任务中执行三次flushSyncCallbacks，但是只会进第一次，因为有全局变量isFlushingSyncQueue，后边两次都直接执行以下就退出了
		scheduleMicroTask(flushSyncCallbacks);
	} else {
		// 其他优先级 用宏任务调度
	}
}

// 传入update后，在scheduleUpdateOnFiber中将lane记录到fibeRootNode中的lane集合中，然后调度，完成更新，接着如果仍然有需要执行的lane通过调度继续更新直到，fiberRootNode中的lane集合都被调度执行完毕
function markRootUpdated(root: FiberRootNode, lane: Lane) {
	// 将本次更新的lane记录到fibeRootNode上的lane集合中
	root.pendingLanes = mergeLanes(root.pendingLanes, lane);
}

// 根据当前fiber一直往上遍历到 fiberRootNode
function markUpdateFromFiberToRoot(fiber: FiberNode) {
	let node = fiber;
	let parent = node.return;
	while (parent !== null) {
		node = parent;
		parent = node.return;
	}
	// 普通fiber跳出循环后,到达了hostRootFiber
	if (node.tag === HostRoot) {
		return node.stateNode;
	}
	return null;
}

// mount流程：1.生成wip fiberNode树 2.标记副作用的flags
// 更新流程的步骤：递: beginWork 归: completeWork

// renderRoot会执行更新的过程(更新流程)
// 调用renderRoot的是触发更新的api: 1.首屏渲染：ReactDOM.createRoot().render(或者老版本的ReactDOM.render) 2.this.setState 3.useState的dispatch方法
// 这就是renderRoot函数
function performSyncWorkOnRoot(root: FiberRootNode, lane: Lane) {
	const nextLane = getHighestPriorityLane(root.pendingLanes);

	if (nextLane !== SyncLane) {
		// 其他比SyncLane低的优先级
		// NoLane
		ensureRootIsScheduled(root);
		return;
	}
	if (__DEV__) {
		console.log('render阶段开始');
	}

	// 初始化 wip、wipRootRenderLane
	prepareFreshStack(root, lane);

	// do while无论如何都会先执行一次循环体
	do {
		try {
			workLoop();
			break;
		} catch (e) {
			if (__DEV__) {
				// 开发环境下的包提示报错信息，生产环境不会 __DEV__编译为false, 开发环境编译为true
				console.warn('workLoop发生错误', e);
			}
			workInProgress = null;
		}
	} while (true);

	// 获取工作完毕后的wip fiberNode树
	const finishedWork = root.current.alternate;
	root.finishedWork = finishedWork;
	// 本次更新的lane
	root.finishedLane = lane;
	// 本次更新结束以后更新为NoLane
	wipRootRenderLane = NoLane;

	// 执行commit操作
	// wip fiberNode树以及树中的flags 执行具体的dom操作
	commitRoot(root);
}

// commit阶段的3个子阶段
// beforeMutation阶段
// mutation阶段
// layout阶段

// 当前commit阶段要执行的任务：
// 1.fiber树的切换(将生成的wip渲染到页面上后，将wip变为current，下次有更新又会生成一颗新的wip) 发生在mutation完成 layout之前
// 2.执行Placement对应操作
function commitRoot(root: FiberRootNode) {
	const finishedWork = root.finishedWork; // wip 根节点<App/>即hostRootFiber对应的wip

	if (finishedWork === null) {
		return;
	}

	if (__DEV__) {
		console.warn('commit阶段开始', finishedWork);
	}
	// 拿到本次更新的lane
	const lane = root.finishedLane;

	if (lane === NoLane && __DEV__) {
		console.error('commit阶段finishedLane不应该是NoLane');
	}

	// 重置
	root.finishedWork = null;
	// 重置本次更新的lane
	root.finishedLane = NoLane;

	// 移除本次更新的lane
	markRootFinished(root, lane);

	// 当前的fiber树中是存在函数组件要执行useEffect回调的
	if (
		(finishedWork.flags & PassiveMask) !== NoFlags ||
		(finishedWork.subtreeFlags & PassiveMask) !== NoFlags
	) {
		// 防止多次执行commitRoot的时候执行多次调度副作用的操作
		if (!rootDoesHasPassiveEffect) {
			rootDoesHasPassiveEffect = true;
			// 调度副作用，调度我们第二个参数这个回调函数，这个回调函数会在setTimeout里面被调度，调度的优先级是NormalPriority
			scheduleCallback(NormalPriority, () => {
				// 执行副作用(异步)
				flushPassiveEffects(root.pendingPassiveEffects);
				return;
			});
		}
	}

	// 判断是否存在3个子阶段需要执行的操作
	// 1.root flags 2.root subtreeFlags
	const subtreeHasEffect =
		(finishedWork.subtreeFlags & MutationMask) !== NoFlags; // 我有插入操作 a = 0; a |= 2;（a为2） a & MutationMask(22) => 2，如果我没有标记 0 & 22 => 0(NoFlags)
	const rootHasEffect = (finishedWork.flags & MutationMask) !== NoFlags;

	// root的subtreeFlags或者flags是否包含MutationMask指定的flag，如果包含，代表当前存在mutation执行的操作
	if (subtreeHasEffect || rootHasEffect) {
		// beforeMutation阶段

		// mutation阶段 Placement，包含了收集副作用
		commitMutationEffects(finishedWork, root);
		// fiber树的切换
		// !!!注意，初次mount的时候，hostRootFiber.alternate就是workInProgress，我们先给workInProgress构建出来一整棵树，然后在commit过程切换，将root.current变为workInProgress成为了current，
		// 这时候current.alternate就变为了最初没有子节点没有被处理的hostRootFiber
		// !!!注意，第一次update调用setState的时候，hostRootFiber(current)的alternate(child为null)是存在的，然后createWorkInProgress wip是存在的，但是他的可以复用的子节点useFiber->createWorkInProgress 子节点的alternate都为null(这种仅限于更新内容没有删除新增操作)，需要在createWorkInProgress重新建立FiberNode
		// !!!注意，第二次update调用setState的时候，只要是更新，所有的current的alternate都是可以复用的就不会再执行createWorkInProgress
		// TODO
		root.current = finishedWork;

		// layout阶段
	} else {
		// 不存在对应的操作
		// fiber树的切换
		root.current = finishedWork;
	}

	rootDoesHasPassiveEffect = false;
	// commit结束后，进行微任务调度
	ensureRootIsScheduled(root);
}

// 执行副作用
// 本次更新的任何create回调都必须在所有上一次更新的destroy回调执行完后再执行。因此需要分别forEach
// 整体执行流程包括：
// 1.遍历effect
// 2.首先触发所有unmount effect，且对于某个fiber，如果触发了unmount destroy，本次更新不会再触发update create
// 3.触发所有上次更新的destroy
// 4.触发所有这次更新的create
function flushPassiveEffects(pendingPassiveEffects: PendingPassiveEffects) {
	// 1.遍历effect
	pendingPassiveEffects.unmount.forEach((effect) => {
		// 2.组件卸载的情况
		// Passive代表了接下来的遍历流程是useEffect的unmount的回调执行
		commitHookEffectListUnmount(Passive, effect);
	});
	// 遍历完将数组置空
	pendingPassiveEffects.unmount = [];
	pendingPassiveEffects.update.forEach((effect) => {
		// 3.触发所有上次更新的destroy  useEffect+HookHasEffect
		commitHookEffectListDestory(Passive | HookHasEffect, effect);
	});
	pendingPassiveEffects.update.forEach((effect) => {
		// 4.触发所有这次更新的create(ps: mount的时候也是在这里去触发的create回调)
		commitHookEffectListCreate(Passive | HookHasEffect, effect);
	});
	// 遍历完将数组置空
	pendingPassiveEffects.update = [];
	// useEffect中有setState这时候也需要触发他的更新流程
	flushSyncCallbacks();
}

// beginWork
// completeWork
function workLoop() {
	while (workInProgress !== null) {
		performUnitOfWork(workInProgress);
	}
}

function performUnitOfWork(fiber: FiberNode) {
	// next可能是子fiber或者null
	const next = beginWork(fiber, wipRootRenderLane);
	// 工作完更改状态，将pendingProps赋值给memoizedProps
	fiber.memoizedProps = fiber.pendingProps;

	if (next === null) {
		// 没有子节点，需要归
		completeUnitOfWork(fiber);
	} else {
		// 有下一个节点继续执行workLoop
		workInProgress = next;
	}
}

function completeUnitOfWork(fiber: FiberNode) {
	let node: FiberNode | null = fiber;

	do {
		completeWork(node);
		const sibling = node.sibling;

		if (sibling !== null) {
			// 有兄弟节点去处理兄弟节点
			workInProgress = sibling;
			return;
		}
		// 没有兄弟节点则返回父节点
		node = node.return;
		workInProgress = node;
	} while (node !== null);
}
