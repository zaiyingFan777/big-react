import { beginWork } from './beginWork';
import { completeWork } from './completeWork';
import { FiberNode } from './fiber';

//指向全局正在工作的fiberNode
let workInProgress: FiberNode | null = null;

// 用于执行初始化的操作
function prepareFreshStack(fiber: FiberNode) {
	workInProgress = fiber;
}

function renderRoot(root: FiberNode) {
	// 初始化
	prepareFreshStack(root);

	do {
		try {
			workLoop();
			break;
		} catch (e) {
			console.warn('workLoop发生错误', e);
			workInProgress = null;
		}
	} while (true);
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
