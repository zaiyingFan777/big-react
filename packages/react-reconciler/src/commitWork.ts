import {
	Container,
	appendChildToContainer,
	commitUpdate,
	removeChild
} from 'hostConfig';
import { FiberNode, FiberRootNode } from './fiber';
import {
	ChildDeletion,
	MutationMask,
	NoFlags,
	Placement,
	Update
} from './fiberFlags';
import {
	FunctionComponent,
	HostComponent,
	HostRoot,
	HostText
} from './workTags';

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
	if ((flags & Update) !== NoFlags) {
		// 有更新操作
		commitUpdate(finishedWork);
		finishedWork.flags &= ~Update;
	}

	// flags ChildDeletion
	if ((flags & ChildDeletion) !== NoFlags) {
		// 有删除子节点操作
		const deletions = finishedWork.deletions;
		if (deletions !== null) {
			deletions.forEach((childToDelete) => {
				// childToDelete每个被删除的fiber
				commitDeletion(childToDelete);
			});
		}
		finishedWork.flags &= ~ChildDeletion;
	}
};

// 当我们要删除div的时候,其实是删除的div这个子树，对于子树中不同类型的组件，需要不同的处理
// 对于FC，需要处理useEffect unmout执行、解绑ref
// 对于HostComponent，需要解绑ref
// 对于子树的根HostComponent，需要移除DOM,对于下面1这种情况dom就是div，如果子树是2这种情况，我们需要往下找到App实际的根HostComponent，才能把他移除
// 1
// <div>
// 	<App/>
// 	123
// 	<p><Child/></p>
// </div>
// 2
// <App>
// 	123
// 	<p><Child/></p>
// </App>

// 递归子树的操作
function commitDeletion(childToDelete: FiberNode) {
	// 找到这个要被删除的fiberNode(子树)的根HostComponent
	let rootHostNode: FiberNode | null = null;

	// 递归子树
	// <div>
	// 	<App/>
	// 	<p>2</p>
	// </div>
	// function App() {
	// 	return <p>1</p>
	// }
	// 上述结构unmountFiber触发的顺序：div、App、p、1(textNode)、p、2
	commitNestedComponent(childToDelete, (unmountFiber) => {
		switch (unmountFiber.tag) {
			case HostComponent:
				// TODO 解绑ref
				if (rootHostNode === null) {
					// 如果rootHostComponent为Null，那么子树的根（rootHostComponent）就可以赋值为当前遍历的HostComponent
					rootHostNode = unmountFiber;
				}
				return;
			case HostText:
				if (rootHostNode === null) {
					// 如果rootHostComponent为Null，那么子树的根（rootHostComponent）就可以赋值为当前遍历的HostComponent
					rootHostNode = unmountFiber;
				}
				return;
			case FunctionComponent:
				// TODO useEffect unmount、解绑ref
				return;
			default:
				if (__DEV__) {
					console.warn('未处理的unmount类型', unmountFiber);
				}
		}
	});

	// 移除rootHostComponent的DOM
	if (rootHostNode !== null) {
		// 找到要删除的子树的根fiber节点的host类型的节点
		const hostParent = getHostParent(childToDelete);
		if (hostParent !== null) {
			// 在hostParent下面删除掉这个子树的根rootHostNode host类型的节点
			removeChild((rootHostNode as FiberNode).stateNode, hostParent);
		}
	}
	// 重置标记、方便垃圾回收
	childToDelete.return = null;
	childToDelete.child = null;
}

// childToDelete需要递归的子树的根节点
// 当前递归到的fiber的回调函数
function commitNestedComponent(
	root: FiberNode,
	onCommitUnmount: (fiebr: FiberNode) => void
) {
	// 深度优先遍历的过程
	let node = root; // 先拿到子树的根节点
	while (true) {
		// 每遍历到一个节点执行一下onCommitUnmount回调函数，对不同的fiber类型执行不同的操作
		onCommitUnmount(node);

		if (node.child !== null) {
			// 向下遍历的过程
			node.child.return = node;
			node = node.child;
			continue;
		}
		if (node === root) {
			// 终止条件
			return;
		}
		// 处理兄弟节点
		while (node.sibling === null) {
			if (node.return === null || node.return === root) {
				return;
			}
			// 向上归的过程
			node = node.return;
		}
		node.sibling.return = node.return;
		node = node.sibling;
	}
}

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
