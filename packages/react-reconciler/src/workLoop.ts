import { beginWork } from './beginWork';
import { commitMutationEffects } from './commitWork';
import { completeWork } from './completeWork';
import { createWorkInProgress, FiberNode, FiberRootNode } from './fiber';
import { MutationMask, NoFlags } from './fiberFlags';
import { HostRoot } from './workTags';

//指向全局正在工作的fiberNode
let workInProgress: FiberNode | null = null;

// 用于执行初始化的操作
function prepareFreshStack(root: FiberRootNode) {
	// root.current: hostRootFiber
	workInProgress = createWorkInProgress(root.current, {});
}

// 在fiber中调度update
// 首屏渲染fiber为：hostRootFiber
// 如果是this.setState，这个fiber肯定就是触发更新的class-component的fiber
export function scheduleUpdateOnFiber(fiber: FiberNode) {
	// TODO 调度功能
	// root: fiberRootNode
	const root = markUpdateFromFiberToRoot(fiber);
	renderRoot(root);
}

// 从fiber向上遍历到fiberRootNode
function markUpdateFromFiberToRoot(fiber: FiberNode) {
	let node = fiber;
	let parent = node.return;
	while (parent !== null) {
		node = parent;
		parent = node.return;
	}
	if (node.tag === HostRoot) {
		return node.stateNode;
	}
	return null;
}

function renderRoot(root: FiberRootNode) {
	// 初始化
	prepareFreshStack(root);

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

	// 完成流程创建好的wip(hostRootFiber)
	const finishedWork = root.current.alternate;
	root.finishedWork = finishedWork;

	// wip fiberNode树 树中的flags
	commitRoot(root);
}

function commitRoot(root: FiberRootNode) {
	// 获取finishedWork(current hostRootFiber的wip)
	const finishedWork = root.finishedWork;

	if (finishedWork === null) {
		return;
	}

	if (__DEV__) {
		console.warn('commit阶段开始', finishedWork);
	}

	// 重置
	root.finishedWork = null;

	// 判断是否存在3个子阶段需要执行的操作
	// root flags root subtreeFlags
	const subtreeHasEffect =
		(finishedWork.subtreeFlags & MutationMask) !== NoFlags;
	const rootHasEffect = (finishedWork.flags & MutationMask) !== NoFlags;

	if (subtreeHasEffect || rootHasEffect) {
		// beforeMutation
		// mutation Placement
		commitMutationEffects(finishedWork);

		root.current = finishedWork;

		// layout
	} else {
		root.current = finishedWork;
	}
}


function workLoop() {
	while (workInProgress !== null) {
		performUnitOfWork(workInProgress);
	}
}

function performUnitOfWork(fiber: FiberNode) {
	// next可能是fiber的子fiber 或 null
	const next = beginWork(fiber);
	// 工作完，对memoizedProps进行赋值
	fiber.memoizedProps = fiber.pendingProps;

	if (next === null) {
		// 到了最下面一层，执行归
		completeUnitOfWork(fiber);
	} else {
		// 没有到最下面一层，将next赋值给workInProgress，继续beginWork
		workInProgress = next;
	}
}

function completeUnitOfWork(fiber: FiberNode) {
	let node: FiberNode | null = fiber;

	do {
		completeWork(node);
		// 没有子节点遍历兄弟节点
		const sibling = node.sibling;

		if (sibling !== null) {
			workInProgress = sibling;
			return;
		}
		// 没有兄弟节点，往上归
		node = node.return;
		workInProgress = node;
	} while (node !== null);
}
