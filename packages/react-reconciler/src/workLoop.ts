import { beginWork } from './beginWork';
import { commitMutationEffects } from './commitWork';
import { completeWork } from './completeWork';
import { createWorkInProgress, FiberNode, FiberRootNode } from './fiber';
import { MutationMask, NoFlags } from './fiberFlags';
import { HostRoot } from './workTags';

// 内存中构建的dom树(最初是hostRootFiber)
let workInProgress: FiberNode | null = null;

// ReactDOM.createRoot(rootElement).render(<App/>)中的container与renderRoot连接上
// 在fiber中调度update
export function scheduleUpdateOnFiber(fiber: FiberNode) {
	// 调度功能
	// 首屏渲染：fiber hostRootFiber
	// 其他的更新：组件的fiber
	// 无论哪种情况我们需要从fiber向上遍历找到fiberRootNode

	// 得到fiberRootNode
	const root = markUpdateFromFiberToRoot(fiber);
	// 执行更新流程
	renderRoot(root);
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
function prepareFreshStack(root: FiberRootNode) {
	// root.current -> hostRootFiber
	// 首屏渲染
	// 因为第一次hostRootFiber被初始化了，所以wip(hostRootFiber)有current
	// 创建root.current(hostRootFiber)的wip
	workInProgress = createWorkInProgress(root.current, {});
}

// render阶段更新流程(递、归)
// 触发更新的几种方式
// ReactDOM.createRoot().render（或老版的ReactDOM.render）
// this.setState
// useState的dispatch方法
function renderRoot(root: FiberRootNode) {
	// 初始化
	prepareFreshStack(root);
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
	const next = beginWork(fiber);
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

	// 重置操作，root.finishedWork = null，root.finishedWork已经被保存在finishedWork中了
	root.finishedWork = null;

	// 判断是否存在三个子阶段需要执行的操作
	// root flags、root subtreeFlags
	const subtreeHasEffect =
		(finishedWork.subtreeFlags & MutationMask) !== NoFlags;
	const rootHasEffect = (finishedWork.flags & MutationMask) !== NoFlags;

	if (subtreeHasEffect || rootHasEffect) {
		// beforeMutation阶段
		// mutation阶段
		commitMutationEffects(finishedWork);
		// fiber树切换在mutation和layout之间
		root.current = finishedWork;

		// layout阶段
	} else {
		// 没有更新也需要执行树切换的操作
		root.current = finishedWork;
	}
}
