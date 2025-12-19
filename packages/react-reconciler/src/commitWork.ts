import {
	appendChildToContainer,
	commitUpdate,
	Container,
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

// 指向下一个要被执行的fiberNode
let nextEffect: FiberNode | null = null;

// 通过subtreeFlags向下找到具有flags的子fiberNode
export const commitMutationEffects = (finishedWork: FiberNode) => {
	nextEffect = finishedWork;

	while (nextEffect !== null) {
		// 向下遍历
		const child: FiberNode | null = nextEffect.child;

		if (
			(nextEffect.subtreeFlags & MutationMask) !== NoFlags &&
			child !== null
		) {
			// 子节点有可能带有mutation阶段的操作，因此继续向下递归
			nextEffect = child;
		} else {
			// 1.找到底了 2.找到的节点不包含subtreeFlags了，但有可能包含flags，因此需要向上遍历
			// 向上遍历 DFS
			up: while (nextEffect !== null) {
				commitMutaitonEffectsOnFiber(nextEffect);
				const sibling: FiberNode | null = nextEffect.sibling;

				if (sibling !== null) {
					nextEffect = sibling;
					break up;
				}
				// 兄弟节点为null，向上归
				nextEffect = nextEffect.return;
			}
		}
	}
};

const commitMutaitonEffectsOnFiber = (finishedWork: FiberNode) => {
	const flags = finishedWork.flags;

	if ((flags & Placement) !== NoFlags) {
		commitPlacement(finishedWork);
		// flags: 0b001
		// 移除   0b001
		// 得到   0b000
		finishedWork.flags &= ~Placement;
	}
	// flags Update
	if ((flags & Update) !== NoFlags) {
		commitUpdate(finishedWork);
		finishedWork.flags &= ~Update;
	}
	// flags ChildDeletion
	if ((flags & ChildDeletion) !== NoFlags) {
		// 要被删除的节点(fiber)存在了父fiber上，标记也打在了父fiber上
		const deletions = finishedWork.deletions;
		// deletions是数组
		if (deletions !== null) {
			deletions.forEach((childToDelete) => {
				commitDeletion(childToDelete);
			});
		}
		finishedWork.flags &= ~ChildDeletion;
	}
};

// 删除child fiber
// * 假设要删除div，是要删除div这个子树，对于子树中的不同类型的组件在面对被删除的时候需要不同的处理
// 1.FC中如果存在useEffect，需要执行unmount的逻辑、解绑ref
// 2.HostComponent，需要解绑ref
// 3.对于子树的跟HostComponent，需要移除DOM，这里是移除div
// <div>
// 	<App />
// 	123
// 	<p>
// 		<Child />
// 	</p>
// </div>;
// * 如果是删除App，我们需要向下找到App实际的根HostComponent组件，并移除
// <App>
// 	123
// 	<p>
// 		<Child />
// 	</p>
// </div>;

// * commitDeletion递归子树的操作
function commitDeletion(childToDelete: FiberNode) {
	// * 定义childToDelete这颗子树的根HostComponent
	let rootHostNode: FiberNode | null = null;

	// 递归子树的流程为：
	// div -> App -> p -> 12（到底了向上归到App） -> p -> 34(到底了，向上归到div)
	// <div>
	// 	<App />
	// 	<p>34</p>
	// </div>;

	// function App() {
	// 	return <p>12</p>;
	// }
	// 递归要被删除的fiber的子树
	commitNestedComponent(childToDelete, (unmountFiber) => {
		switch (unmountFiber.tag) {
			case HostComponent:
				// 如果childToDelete子树的根HostComponent为null，说明找到了，则赋值
				if (rootHostNode === null) {
					rootHostNode = unmountFiber;
				}
				// TODO 解绑ref
				return;
			case HostText:
				// 如果childToDelete子树的根HostComponent为null，说明找到了，则赋值
				if (rootHostNode === null) {
					rootHostNode = unmountFiber;
				}
				return;
			case FunctionComponent:
				// TODO useEffect unmount 、解绑ref
				return;
			default:
				if (__DEV__) {
					console.warn('未处理的unmount类型', unmountFiber);
				}
		}
	});

	// 移除childToDelete的rootHostComponent的DOM
	if (rootHostNode !== null) {
		// 然后再找到childToDelete的父fiber的DOM
		const hostParent = getHostParent(childToDelete);
		if (hostParent !== null) {
			removeChild((rootHostNode as FiberNode).stateNode, hostParent);
		}
	}
	// 彻底的移除链接、重置标记
	childToDelete.return = null;
	childToDelete.child = null;
}

// root要被删除的fiber
function commitNestedComponent(
	root: FiberNode,
	onCommitUnmount: (fiber: FiberNode) => void
) {
	let node = root;
	// * 深度优先遍历
	while (true) {
		onCommitUnmount(node);

		if (node.child !== null) {
			// 向下遍历
			node.child.return = node;
			node = node.child;
			continue;
		}
		if (node === root) {
			// 终止条件
			return;
		}
		// 兄弟节点为空，向上归
		while (node.sibling === null) {
			if (node.return === null || node.return === root) {
				return;
			}
			// 向上归
			node = node.return;
		}
		// 兄弟节点不为空，递归兄弟节点
		node.sibling.return = node.return;
		node = node.sibling;
	}
}

const commitPlacement = (finishedWork: FiberNode) => {
	if (__DEV__) {
		console.warn('执行Placement操作', finishedWork);
	}
	// parent DOM
	const hostParent = getHostParent(finishedWork);
	// console.log('hostParent', hostParent);
	// finishedWork ~~ DOM append parent DOM
	if (hostParent !== null) {
		// 找到finished对应的dom节点插入到父节点
		appendPlacementNodeIntoContainer(finishedWork, hostParent);
	}
};

function getHostParent(fiber: FiberNode): Container | null {
	let parent = fiber.return;

	while (parent) {
		const parentTag = parent.tag;
		// HostComponent HostRoot
		if (parentTag === HostComponent) {
			return parent.stateNode as Container;
		}
		if (parentTag === HostRoot) {
			// HostRoot: HostRootFiber，找到的是fiberRootNode.container
			return (parent.stateNode as FiberRootNode).container;
		}
		parent = parent.return;
	}
	if (__DEV__) {
		console.warn('未找到host parent');
	}
	return null;
}

// 找到finishedWork下面第一层是hostcomponent或hosttext类型节点，都插入到hostParent中
function appendPlacementNodeIntoContainer(
	finishedWork: FiberNode,
	hostParent: Container
) {
	// 找到fiber(finishedWork)对应的host(DOM)
	if (finishedWork.tag === HostComponent || finishedWork.tag === HostText) {
		appendChildToContainer(hostParent, finishedWork.stateNode);
		return;
	}
	const child = finishedWork.child;
	if (child !== null) {
		appendPlacementNodeIntoContainer(child, hostParent);
		let sibling = child.sibling;

		while (sibling !== null) {
			appendPlacementNodeIntoContainer(sibling, hostParent);
			sibling = sibling.sibling;
		}
	}
}
