import {
	appendChildToContainer,
	commitUpdate,
	Container,
	insertChildToContainer,
	Instance,
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

function recordHostChildrenToDelete(
	childrenToDelete: FiberNode[],
	unmountFiber: FiberNode
) {
	// 1. 找到第一个root host节点
	const lastOne = childrenToDelete[childrenToDelete.length - 1];

	if (!lastOne) {
		// 最后一个不存在，childrenToDelete为空数组，所以我们将unmountFiber push到childrenToDelete中
		childrenToDelete.push(unmountFiber);
	} else {
		// 我们需要判断unmountFiber是不是最后一个节点的兄弟节点（此时兄弟节点存在）
		let node = lastOne.sibling;
		while (node !== null) {
			if (unmountFiber === node) {
				childrenToDelete.push(unmountFiber);
			}
			node = node.sibling;
		}
	}

	// 2. 每找到一个 host节点，判断下这个节点是不是 1 找到那个节点的兄弟节点
}

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
	// let rootHostNode: FiberNode | null = null;
	// * 由于Fragment下有可能有多个根host节点，因此我们定义为数组
	const rootChildrenToDelete: FiberNode[] = [];

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
				// if (rootHostNode === null) {
				// 	rootHostNode = unmountFiber;
				// }
				// * 支持fragment
				recordHostChildrenToDelete(rootChildrenToDelete, unmountFiber);
				// TODO 解绑ref
				return;
			case HostText:
				// 如果childToDelete子树的根HostComponent为null，说明找到了，则赋值
				// if (rootHostNode === null) {
				// 	rootHostNode = unmountFiber;
				// }
				// * 支持fragment
				recordHostChildrenToDelete(rootChildrenToDelete, unmountFiber);
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
	if (rootChildrenToDelete.length) {
		// 然后再找到childToDelete的父fiber的DOM
		const hostParent = getHostParent(childToDelete);
		if (hostParent !== null) {
			rootChildrenToDelete.forEach((node) => {
				removeChild(node.stateNode, hostParent);
			});
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

	// * 移动的情况
	// * 需要找到host sibling 目标兄弟Host节点，执行parentNode.insertBefore
	const sibling = getHostSibling(finishedWork);

	// console.log('hostParent', hostParent);
	// finishedWork ~~ DOM append parent DOM
	if (hostParent !== null) {
		// 找到finished对应的dom节点插入到父节点
		insertOrAppendPlacementNodeIntoContainer(finishedWork, hostParent, sibling);
	}
};

// 1.先找同级的sibling是host类型的节点
// 2.同级sibling没有host类型的节点的，我们向下找
// 3.同级sibling为null，我们向上遍历
function getHostSibling(fiber: FiberNode) {
	let node: FiberNode = fiber;

	findSibling: while (true) {
		// 3.同级兄弟节点为空，我们向上遍历。
		while (node.sibling === null) {
			const parent = node.return;

			if (
				parent === null ||
				parent.tag === HostComponent ||
				parent.tag === HostRoot
			) {
				return null;
			}
			node = parent;
		}

		// 1.找同级的sibling
		node.sibling.return = node.return;
		node = node.sibling;

		while (node.tag !== HostText && node.tag !== HostComponent) {
			// 2.直接兄弟节点不是host类型节点，向下遍历
			if ((node.flags & Placement) !== NoFlags) {
				// * 节点不稳定，跳过
				continue findSibling;
			}
			if (node.child === null) {
				// 已经到底了
				continue findSibling;
			} else {
				// 向下遍历
				node.child.return = node;
				node = node.child;
			}
		}

		if ((node.flags & Placement) === NoFlags) {
			// * 找到了目标host类型节点
			return node.stateNode;
		}
	}
}

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

// 插入、移动
// 1.parent.appendChild: 找到finishedWork下面第一层是hostcomponent或hosttext类型节点，都插入到hostParent中
// 2.parent.insertBefore，找到目标兄弟host节点
function insertOrAppendPlacementNodeIntoContainer(
	finishedWork: FiberNode,
	hostParent: Container,
	before?: Instance
) {
	// 找到fiber(finishedWork)对应的host(DOM)
	if (finishedWork.tag === HostComponent || finishedWork.tag === HostText) {
		if (before) {
			// 移动
			insertChildToContainer(finishedWork.stateNode, hostParent, before);
		} else {
			// 插入
			appendChildToContainer(hostParent, finishedWork.stateNode);
		}
		return;
	}
	const child = finishedWork.child;
	if (child !== null) {
		insertOrAppendPlacementNodeIntoContainer(child, hostParent);
		let sibling = child.sibling;

		while (sibling !== null) {
			insertOrAppendPlacementNodeIntoContainer(sibling, hostParent);
			sibling = sibling.sibling;
		}
	}
}
