// 完整的工作循环，调用beginWork和completeWork
import { beginWork } from './beginWork';
import { completeWork } from './completeWork';
import { FiberNode } from './fiber';

// 全局的指针指向当前正在工作的fiberNode
let workInProgress: FiberNode | null = null;

// 执行初始化的操作
function prepareFreshStack(fiber: FiberNode) {
	workInProgress = fiber;
}

function renderRoot(root: FiberNode) {
	prepareFreshStack(root);

	// do while无论如何都会先执行一次循环体
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
		completeWork(fiber);
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
