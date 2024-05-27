// commit阶段的方法

import { appendChildToContainer, Container } from 'hostConfig';
import { FiberNode, FiberRootNode } from './fiber';
import { MutationMask, NoFlags, Placement } from './fiberFlags';
import { HostComponent, HostRoot, HostText } from './workTags';

let nextEffect: FiberNode | null = null;

// mutation时期执行的方法
// finishedWork: 生成的wip fiberNode (hostFiberRoot)
export const commitMutationEffects = (finishedWork: FiberNode) => {
	nextEffect = finishedWork;

	while (nextEffect !== null) {
		// 向下遍历
		const child: FiberNode | null = nextEffect.child;
		if (
			(nextEffect.subtreeFlags & MutationMask) !== NoFlags &&
			child !== null
		) {
			// 继续向子节点遍历，说明子节点有Mutation阶段的操作
			nextEffect = child;
		} else {
			// 说明遍历到底了，或者找到的节点没有subtreeFlags了(或者说没有subtreeFlags了，但可能有flags)
			// <div><span>111</span></div>  假设span的flag为Placement，div的subtreeFlags为1(div没有其他的flag)，所以我们找到span因为他没有subtreeflag但是有flag，需要插入
			// 这时候我们需要向上遍历 dfs
			up: while (nextEffect !== null) {
				// 执行Placement、Update、ChildDeletion等操作
				commitMutationEffectsOnFiber(nextEffect);
				// 找兄弟节点
				const sibling: FiberNode | null = nextEffect.sibling;
				// 执行兄弟节点的向下遍历操作
				if (sibling !== null) {
					nextEffect = sibling;
					break up;
				}
				nextEffect = nextEffect.return;
			}
		}
	}
};

const commitMutationEffectsOnFiber = (finishedWork: FiberNode) => {
	const flags = finishedWork.flags;

	// flag Placement
	if ((flags & Placement) !== NoFlags) {
		commitPlacement(finishedWork);
		// 移除标记
		// 0b001
		//    &
		// 0b110
		// 0b000
		finishedWork.flags &= ~Placement;
	}

	// flag Update
	// flag ChildDeletion
};

// 插入操作
const commitPlacement = (finishedWork: FiberNode) => {
	// 我们需要知道parent dom
	// 我们需要找到finishedWork对应的dom节点，才能插入到parent节点
	if (__DEV__) {
		console.warn('执行Placement操作', finishedWork);
	}
	// parent dom
	const hostParent = getHostParent(finishedWork);
	// 找到finishedWork对应的dom，并append到parent中
	if (hostParent !== null) {
		appendPlacementNodeIntoContainer(finishedWork, hostParent);
	}
};

// 获取宿主环境的parent
function getHostParent(fiber: FiberNode): Container | null {
	// 我们需要执行向上遍历的过程
	let parent = fiber.return;

	while (parent) {
		// 判断parent的tag
		const parentTag = parent.tag;
		// HostComponent HostRoot
		if (parentTag === HostComponent) {
			return parent.stateNode;
		}
		if (parentTag === HostRoot) {
			// hostRootFiber(#root对应的fiberNode).stateNode -> fiberRootNode
			// fiberRootNode.container -> #root
			return (parent.stateNode as FiberRootNode).container;
		}
		// 向上找parent
		parent = parent.return;
	}
	if (__DEV__) {
		console.warn('未找到hsot parent');
	}
	return null;
}

// 将dom插入到父节点dom
function appendPlacementNodeIntoContainer(
	finishedWork: FiberNode,
	hostParent: Container
) {
	// finishedWork找到对应宿主环境的fiber
	// 递归向下的过程
	if (finishedWork.tag === HostComponent || finishedWork.tag === HostText) {
		appendChildToContainer(hostParent, finishedWork.stateNode);
		return;
	}
	// 当前节点不是host类型可能是函数组件，我们需要向下遍历找到真正的Host节点
	const child = finishedWork.child;
	if (child !== null) {
		appendPlacementNodeIntoContainer(child, hostParent);
		// 兄弟节点也要插入到父结点上
		let sibling = child.sibling;

		while (sibling !== null) {
			appendPlacementNodeIntoContainer(sibling, hostParent);
			sibling = sibling.sibling;
		}
	}
}
