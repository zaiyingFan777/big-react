import { Container, appendChildToContainer } from 'hostConfig';
import { FiberNode, FiberRootNode } from './fiber';
import { MutationMask, NoFlags, Placement } from './fiberFlags';
import { HostComponent, HostRoot, HostText } from './workTags';

let nextEffect: FiberNode | null = null;

export const commitMutationEffects = (finishedWork: FiberNode) => {
	nextEffect = finishedWork;

	while (nextEffect !== null) {
		// 向下遍历
		const child: FiberNode | null = nextEffect.child;

		// 先往下，再往上
		// 如果当前对应的nextEffect的subtreeFlags存在、同时subtreeFlags包含了MutationMask中的flags，并且子节点也存在
		if (
			(nextEffect.subtreeFlags & MutationMask) !== NoFlags &&
			child !== null
		) {
			// 继续向子节点遍历，因为 nextEffect.subtreeFlags & MutationMask !== NoFlags代表了子节点有可能存在对应的Mutation阶段的操作
			nextEffect = child;
		} else {
			// 到底了，或者我们找到的节点不包括subtreeFlags了，如果不包含subtreeFlags那么有可能包含flags，这时候我们向上遍历 DFS
			up: while (nextEffect !== null) {
				commitMutaitonEffectsOnFiber(nextEffect);
				const sibling: FiberNode | null = nextEffect.sibling;

				// 如果有兄弟节点，就向下遍历兄弟节点，打破up while
				if (sibling !== null) {
					nextEffect = sibling;
					break up;
				}

				// 如果sibling为null，向上遍历,找到父节点，
				nextEffect = nextEffect.return;
			}
		}
	}
};

const commitMutaitonEffectsOnFiber = (finishedWork: FiberNode) => {
	const flags = finishedWork.flags;

	// flags Placement
	// 比如a = 0, a |= 2(placement) => a = 2, a & 2 => 2 !== NoFlags
	// 比如a = 0, a |= 4(Update) => a = 4, a & 2 === NoFlags
	if ((flags & Placement) !== NoFlags) {
		// 有插入操作
		commitPlacement(finishedWork);
		// 移除flags中的插入(Placement)操作：a = 0, a |= 2(placement) => a = 2，a &= ~2 => a = 0
		finishedWork.flags &= ~Placement;
	}

	// flags Update

	// flags ChildDeletion
};

// parent DOM
// finishedWork ~~ DOM
// 将finishedWork插入到parent
const commitPlacement = (finishedWork: FiberNode) => {
	if (__DEV__) {
		console.warn('执行Placement操作', finishedWork);
	}

	// parent DOM
	// 获取宿主环境的父节点
	const hostParent = getHostParent(finishedWork);

	// finishedWork ~~ DOM append parent DOM
	// 找到finishedWork对应的DOM
	// 将finishedWork插入到parent
	if (hostParent !== null) {
		appendPlacementNodeIntoContainer(finishedWork, hostParent);
	}
};

function getHostParent(fiber: FiberNode): Container | null {
	// 向上
	let parent = fiber.return;

	while (parent) {
		const parentTag = parent.tag;
		// HostComponent HostRoot
		if (parentTag === HostComponent) {
			return parent.stateNode as Container;
		}
		if (parentTag === HostRoot) {
			// HostRoot.stateNode(FiberRootNode).container 就是根节点
			return (parent.stateNode as FiberRootNode).container;
		}
		parent = parent.return;
	}
	if (__DEV__) {
		console.warn('未找到host parent');
	}
	return null;
}

function appendPlacementNodeIntoContainer(
	finishedWork: FiberNode,
	hostParent: Container
) {
	// (finishedWork)不一定是host类型，通过fiber向下遍历找到他宿主环境（host）的fiber，然后把他append到host parent下
	if (finishedWork.tag === HostComponent || finishedWork.tag === HostText) {
		appendChildToContainer(hostParent, finishedWork.stateNode);
		return;
	}
	// 向下寻找
	const child = finishedWork.child;
	if (child !== null) {
		appendPlacementNodeIntoContainer(child, hostParent);
		// child的兄弟节点也要插入进去
		let sibling = child.sibling;

		while (sibling !== null) {
			appendPlacementNodeIntoContainer(sibling, hostParent);
			sibling = sibling.sibling;
		}
	}
}
