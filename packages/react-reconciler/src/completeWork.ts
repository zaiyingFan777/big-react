import {
	appendInitialChild,
	Container,
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

// completework标记更新
function markUpdate(fiber: FiberNode) {
	fiber.flags |= Update;
}

/**
 * completeWork性能优化策略
 * flags分布在不同fiberNode中，如何快速找到他们？
 * 答案：利用completeWork向上遍历（归）的流程，将子fiberNode的flags冒泡到父fiberNode
 */

export const completeWork = (wip: FiberNode) => {
	// 递归中的归阶段

	// 获取新的props
	const newProps = wip.pendingProps;
	// 获取当前渲染树
	const current = wip.alternate;

	// 对于Host类型的fiberNode，构建离屏DOM树
	switch (wip.tag) {
		case HostRoot:
			bubbleProperties(wip);
			return null;
		case HostComponent:
			if (current !== null && wip.stateNode) {
				// update
				// classname a => b 标记update
				// 将合成事件保存在DOM中，2.更新属性时
				// 1.props是否变化 {onClick: xx} => {onClick: xxx}
				// 2.变了 Update flag
				// 我们这里没有判断哪样属性变了，直接赋值
				updateFiberProps(wip.stateNode, newProps);
			} else {
				// mount
				// 1.构建DOM
				// 将合成事件保存在DOM中，1.创建DOM时
				const instance = createInstance(wip.type, newProps);
				// 2.将DOM插入到DOM树中
				appendAllChildren(instance, wip);
				// 3.将创建的instance赋值给wip
				wip.stateNode = instance;
			}
			bubbleProperties(wip);
			return null;
		case HostText:
			if (current !== null && wip.stateNode) {
				// update
				// 主要处理标记Update的情况
				// 知识回忆：beginwork后会把fiber的pendingProps赋值给fiber的memoizedProps
				// next: 子fiber或者null
				// const next = beginWork(fiber);
				// // 工作完成后赋值memoizedProps
				// fiber.memoizedProps = fiber.pendingProps;

				// 因此我们在memoizedProps上拿到oldText
				const oldText = current.memoizedProps?.content;
				const newText = newProps.content;
				if (oldText !== newText) {
					// 标记Update 标记都是打在wip上的不搞到current，因为后续commit操作的时候是wip，操作完dom后再把wip赋值给current
					markUpdate(wip);
				}
			} else {
				// mount
				// 1.构建DOM
				const instance = createTextInstance(newProps.content);
				// 2.HostText不存在child因此wip没有child需要挂载到文本节点里
				// 3.将创建的instance赋值给wip
				wip.stateNode = instance;
			}
			bubbleProperties(wip);
			return null;
		case FunctionComponent:
			bubbleProperties(wip);
			return null;
		default:
			if (__DEV__) {
				console.warn('未处理的completeWork情况', wip);
			}
			break;
	}
	// return null;
};

/**
 * @desc: appendAllChildren函数一些注释
 * parent为wip创建的instance,这个函数就是将wip的子节点插入到wip创建的instance中
 * 1.构建DOM
 * const instance = createInstance(wip.type, newProps);
 * 2.将DOM插入到DOM树中
 * appendAllChildren(instance, wip);
 *
 * 比如
 * function A() {
 *  return <div></div>
 * }
 * <h3><A/><A/></h3> // 对于Dom树。h3的子节点应该是<div></div><div></div>
 *
 * parent: h3, wip: h3的fiberNode, 这时候我们找到wip的child发现是函数式组件，我们肯定得向下递归找到div，然后把div插入到h3中。然后再去判断div有没有兄弟节点，这时候是没有的，
 * 我们需要node = node?.return，然后这时候node是A的fiberNode，然后node.sibling !== null是下一个A,然后跳出while，将node赋值为node.silbing就是第二个A,然后，A是函数组件，且
 * A的child不是null，然后将node赋值为第二个A的div，然后这时候div是HostComponent将div插入到h3(<h3><A/><A/></h3>)然后判断是否有兄弟节点，这里是没有的，node = node.return，
 * node为第二个A，因为node.silbling是null，并且node.return是wip，那么就退出循环
 * 深度优先，层级遍历（找兄弟）然后再往上归
 */
function appendAllChildren(parent: Container, wip: FiberNode) {
	// 找到孩子节点
	let node = wip.child;

	// 递归插入子节点
	while (node !== null) {
		if (node.tag === HostComponent || node.tag === HostText) {
			// 找到了执行append的操作
			appendInitialChild(parent, node?.stateNode);
		} else if (node.child !== null) {
			// 没找到，继续往下查找
			node.child.return = node;
			node = node.child;
			continue;
		}

		// 往上归
		if (node === wip) {
			return;
		}

		while (node.sibling === null) {
			if (node.return === null || node.return === wip) {
				return;
			}
			// 找到头了，往上归
			node = node?.return;
		}
		// 找兄弟节点
		node.sibling.return = node.return;
		node = node.sibling;
	}
}

// complete性能优化策略，利用complete向上遍历（归）的流程，将子fiberNode的flags冒泡到父fiberNode
function bubbleProperties(wip: FiberNode) {
	let subtreeFlags = NoFlags;
	let child = wip.child;

	while (child !== null) {
		// 将子节点的subtreeFlags附加到wip的subtreeFlags上，这样当前节点的subtreeFlags就包含了子节点的subtreeFlags
		subtreeFlags |= child.subtreeFlags;
		// 还应该包含child的flags
		subtreeFlags |= child.flags;

		child.return = wip;
		// 遍历child的兄弟节点
		child = child.sibling;
	}

	// 遍历完child以及child的兄弟节点后(这里每层只需要遍历所有的第一层子节点即可，因为子节点归上来的时候会收集子节点的子节点们的flags和subtreeFlags)，将subtreeFlags附加给wip
	wip.subtreeFlags |= subtreeFlags;
}
