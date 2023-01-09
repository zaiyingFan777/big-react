// 完整的工作循环，调用beginWork和completeWork
import { beginWork } from './beginWork';
import { commitMutationEffects } from './commitWork';
import { completeWork } from './completeWork';
import { FiberNode, FiberRootNode, createWorkInProgress } from './fiber';
import { MutationMask, NoFlags } from './fiberFlags';
import { HostRoot } from './workTags';

// 全局的指针指向当前正在工作的fiberNode
let workInProgress: FiberNode | null = null;

// 执行初始化的操作
function prepareFreshStack(root: FiberRootNode) {
	// FiberRootNode不是一个普通的fiberNode不能直接当作workInProgress，因此需要一个方法将fiberRootNode变为fiberNode
	// 为我们的hostRootFiber创建一个workInProgress
	workInProgress = createWorkInProgress(root.current, {});
}

// 连接ReactDOM.createRoot().render()中的render调用的updateContainer方法与renderRoot方法
export function scheduleUpdateOnFiber(fiber: FiberNode) {
	// TODO调度功能
	// 1.首屏渲染传进来的时hostRootFiber，2.对于其他更新流程传入的是class component或者function component对应的fiber

	// 根据当前fiber一直往上遍历到 fiberRootNode
	// 拿到fiberRootNode
	const root = markUpdateFromFiberToRoot(fiber);
	renderRoot(root);
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
function renderRoot(root: FiberRootNode) {
	prepareFreshStack(root);

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

	// 重置
	root.finishedWork = null;

	// 判断是否存在3个子阶段需要执行的操作
	// 1.root flags 2.root subtreeFlags
	const subtreeHasEffect =
		(finishedWork.subtreeFlags & MutationMask) !== NoFlags; // 我有插入操作 a = 0; a |= 2;（a为2） a & MutationMask(22) => 2，如果我没有标记 0 & 22 => 0(NoFlags)
	const rootHasEffect = (finishedWork.flags & MutationMask) !== NoFlags;

	// root的subtreeFlags或者flags是否包含MutationMask指定的flag，如果包含，代表当前存在mutation执行的操作
	if (subtreeHasEffect || rootHasEffect) {
		// beforeMutation阶段

		// mutation阶段 Placement
		commitMutationEffects(finishedWork);
		// fiber树的切换
		root.current = finishedWork;

		// layout阶段
	} else {
		// 不存在对应的操作
		// fiber树的切换
		root.current = finishedWork;
	}
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
	const next = beginWork(fiber);
	// 工作完更改状态
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
