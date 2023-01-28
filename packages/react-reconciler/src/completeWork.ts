import {
	Container,
	appendInitialChild,
	createInstance,
	createTextInstance
} from 'hostConfig';
import { FiberNode } from './fiber';
import {
	FunctionComponent,
	HostComponent,
	HostRoot,
	HostText
} from './workTags';
import { NoFlags, Update } from './fiberFlags';
import { updateFiberProps } from 'react-dom/src/SyntheticEvent';

// 标记更新的方法
function markUpdate(fiber: FiberNode) {
	fiber.flags |= Update;
}

export const completeWork = (wip: FiberNode) => {
	// 递归中的归阶段

	const newProps = wip.pendingProps;
	const current = wip.alternate;

	switch (wip.tag) {
		case HostComponent:
			if (current !== null && wip.stateNode) {
				// update
				// 1. props是否变化{onClick: xx} {onClick: xxx}
				// 2. 变了Update flag
				// FiberNode.updateQueue = [className, 'aaa', title, 'hahaha'] // 第n项是我们变化的属性，n+1项变化的是属性名。比如className是第n，第n+1就是变为了'aaa'
				// 我们取的n就是key, n+1就是value，然后再hostConfig里面去更新dom属性
				// className a => b，style属性 这都需要判断变没变

				// 将事件回调保存在DOM中，通过以下两个时机对接：1.创建dom时，2.更新属性时
				// 这里是更新dom
				updateFiberProps(wip.stateNode, newProps);
			} else {
				// 首屏mount
				// 1.构建离屏DOM
				// const instance = createInstance(wip.type, newProps); // 创建dom节点
				const instance = createInstance(wip.type, newProps); // 创建dom节点
				// 2.将DOM插入到DOM树中
				appendAllChildren(instance, wip);
				wip.stateNode = instance;
			}
			bubbleProperties(wip);
			return null;
		case HostText:
			if (current !== null && wip.stateNode) {
				// update
				const oldText = current.memoizedProps?.content; // 老的文本
				const newText = newProps.content; // 新的文本
				if (oldText !== newText) {
					markUpdate(wip);
				}
			} else {
				// 首屏mount
				// 1.构建离屏DOM 文本节点没有child
				const instance = createTextInstance(newProps.content); // 创建dom节点
				wip.stateNode = instance;
			}
			bubbleProperties(wip);
			return null;
		case HostRoot:
			bubbleProperties(wip);
			return;
		case FunctionComponent:
			bubbleProperties(wip);
			return;
		default:
			if (__DEV__) {
				console.warn('未处理的completeWork情况', wip);
			}
			break;
	}
};

// function A() {
// 	return <div></div>
// }
// <h3><A/></h3>
// 对于离屏dom，插入到h3的是A中的div

// <h3><A/><A/></h3> 不光要插入A，还需要插入A的兄弟节点
function appendAllChildren(parent: Container, wip: FiberNode) {
	let node = wip.child;

	// 递归插入
	while (node !== null) {
		// 往下找
		if (node?.tag === HostComponent || node?.tag === HostText) {
			appendInitialChild(parent, node?.stateNode);
		} else if (node.child !== null) {
			node.child.return = node;
			node = node.child;
			continue;
		}

		if (node === wip) {
			return;
		}

		// 往下找到头后，我们往上找
		while (node.sibling === null) {
			// 归
			if (node.return === null || node.return === wip) {
				return;
			}
			// 往上递归
			node = node?.return;
		}
		node.sibling.return = node.return;
		node = node.sibling;
	}
}

// completeWork性能优化策略
// flags分布在不同fiberNode中，如何快速找到他们？
// 答案：利用completeWork向上遍历（归）的流程，将子fiberNode的flags冒泡到父fiberNode
function bubbleProperties(wip: FiberNode) {
	let subtreeFlags = NoFlags;
	let child = wip.child;

	while (child !== null) {
		// 当前节点的subtreeFlags包含子节点的flags以及子节点的subtreeFlags
		subtreeFlags |= child.subtreeFlags; // 将child的subtreeFlags添加到自己身上的subtreeFlags
		subtreeFlags |= child.flags;

		child.return = wip;
		// 转变指针到child的兄弟节点
		child = child.sibling;
	}

	wip.subtreeFlags |= subtreeFlags;
}
