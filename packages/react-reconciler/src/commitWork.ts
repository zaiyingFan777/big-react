// commit阶段的方法

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
	if ((flags & Update) !== NoFlags) {
		commitUpdate(finishedWork);
		// 移除标记
		finishedWork.flags &= ~Update;
	}
	// flag ChildDeletion
	if ((flags & ChildDeletion) !== NoFlags) {
		const deletions = finishedWork.deletions;
		// 删除finishedWork下面的子节点
		if (deletions !== null) {
			deletions.forEach((childToDelete) => {
				commitDeletion(childToDelete);
			});
		}
		// 移除标记
		finishedWork.flags &= ~ChildDeletion;
	}
};

// 删除操作
// 如果删除div 他的子节点也需要不同的处理，比如FunctionComponent(useEffect unmount执行、解绑ref)、HostComponent(解绑ref)、对于div我们需要移除div的DOM,
// <div>
// 	<App />
// 	123
// 	<p>
// 		<Child />
// 	</p>
// </div>;
// 但是如果div变为了App函数组件，我们需要找到函数组件实际的根hostComponent的dom并将她移除
// <App>
// 	123
// 	<p>
// 		<Child />
// 	</p>
// </App>
// 递归子树的操作
// 对于FC，需要处理useEffect unmout执行、解绑ref
// 对于HostComponent，需要解绑ref
// 对于子树的根HostComponent，需要移除DOM
function commitDeletion(childToDelete: FiberNode) {
	// 子树的根HostComponent类型的节点
	let rootHostNode: FiberNode | null = null;

	// 递归子树
	// demo childToDelete为div，也就是删除div以及div的子节点
	// <div>
	// 	<App/>
	// 	<p2/>
	// </div>
	// function App() {
	// 	return <p1>123</p1>
	// }
	// commitNestedComponent回调函数的执行顺序为 div App p1 123 p2
	commitNestedComponent(childToDelete, (unmountFiber) => {
		switch (unmountFiber.tag) {
			// classComponent会调用componentWillUnmount生命周期钩子
			case HostComponent:
				// 这里会找到childToDelete下面第一个host类型的子节点并删除
				if (rootHostNode === null) {
					rootHostNode = unmountFiber;
				}
				// TODO 解绑ref
				return;
			case HostText:
				// 这里会找到childToDelete下面第一个host类型的子节点并删除
				if (rootHostNode === null) {
					rootHostNode = unmountFiber;
				}
				return;
			case FunctionComponent:
				// TODO useEffect unmount的处理、解绑ref
				return;
			default:
				if (__DEV__) {
					console.warn('未处理的unmount类型', unmountFiber);
				}
		}
	});

	// 移除rootHostNode的DOM
	if (rootHostNode !== null) {
		// hostParent是我们要删掉的子树中的根fiber节点的host类型的parent
		const hostParent = getHostParent(childToDelete);
		if (hostParent !== null) {
			// 我们在hostParent下面删除这个子树的根host类型的节点
			removeChild((rootHostNode as FiberNode).stateNode, hostParent);
		}
	}
	// 重置操作
	childToDelete.return = null;
	childToDelete.child = null;
}

// 移除rootHostComponent的DOM
// 需要递归子树的根节点：root
// onCommitUnmount递归到的当前fiber的回调函数
function commitNestedComponent(
	root: FiberNode,
	onCommitUnmount: (fiber: FiberNode) => void
) {
	// 深度优先遍历的过程
	let node = root;
	while (true) {
		onCommitUnmount(node);
		// 向下遍历
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
		// 处理node的兄弟节点
		while (node.sibling === null) {
			if (node.return === null || node.return === root) {
				// 终止条件
				return;
			}
			// 向上遍历（归）的过程
			node = node.return;
		}
		// 如果node的兄弟节点不为null，处理兄弟节点
		node.sibling.return = node.return;
		node = node.sibling;
	}
}

// 插入操作
const commitPlacement = (finishedWork: FiberNode) => {
	// 我们需要知道parent dom
	// 我们需要找到finishedWork对应的dom节点，才能插入到parent节点
	if (__DEV__) {
		console.warn('执行Placement操作', finishedWork);
	}
	// parent dom
	const hostParent = getHostParent(finishedWork);

	// host sibling
	// parentNode.insertBefore需要找到【目标兄弟host节点】
	const sibling = getHostSibling(finishedWork);

	// 找到finishedWork对应的dom，并append到parent中
	if (hostParent !== null) {
		insertOrAppendPlacementNodeIntoContainer(finishedWork, hostParent, sibling);
	}
};

// 寻找目标兄弟host节点
// 1.可能并不是目标fiber的直接兄弟节点
// 情况1 A的兄弟节点是B组件返回子节点idv，需要向下找
// <A/><B/>
// function B(){
// 	return <div/>
// }
// 情况2 A组件的host类型的兄弟节点是父节点的div，需要向上找
// <App/><div/>
// function App(){
// 	return <A/>
// }
// 2.不稳定的host节点不能作为目标兄弟host节点
// 不稳定的host
// B A(Placement) B来说他的兄弟节点是A，但是A也在移动，把A作为B插入的依据，是不稳定的，需要排除A
function getHostSibling(fiber: FiberNode) {
	let node: FiberNode = fiber;

	findSibling: while (true) {
		// 情况2，想上找到APP,再去找app的兄弟节点div
		while (node.sibling === null) {
			// 向上找父节点的兄弟节点
			const parent = node.return;

			if (
				parent === null ||
				parent.tag === HostComponent ||
				parent.tag === HostRoot
			) {
				// 没找到，因为node没有兄弟节点，并且父节点是Host类型，那么他就没有兄弟节点了。返回null
				return null;
			}

			// 向上遍历
			node = parent;
		}

		// 保持链接
		node.sibling.return = node.return;
		node = node.sibling;

		// 3 !== 1 && 3 !== 2 true
		// 3 !== 1 && 3 !== 3 false
		// 所以node.tag是hostText和hostComponent之外的组件类型，才会进入到这个循环下
		while (node.tag !== HostText && node.tag !== HostComponent) {
			// node的直接sibling不是host类型，继续往下找
			if ((node.flags & Placement) !== NoFlags) {
				// 不稳定的节点，跳过，继续findSibling流程
				continue findSibling;
			}
			if (node.child === null) {
				// 到底了
				continue findSibling;
			} else {
				// 向下找 情况1
				node.child.return = node;
				node = node.child;
			}
		}

		// 稳定的节点，且是hostText或者hostComponent类型
		if ((node.flags & Placement) === NoFlags) {
			return node.stateNode;
		}
	}
}
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
function insertOrAppendPlacementNodeIntoContainer(
	finishedWork: FiberNode,
	hostParent: Container,
	before?: Instance
) {
	// finishedWork找到对应宿主环境的fiber
	// 递归向下的过程
	if (finishedWork.tag === HostComponent || finishedWork.tag === HostText) {
		if (before) {
			// insertBefore
			insertChildToContainer(finishedWork.stateNode, hostParent, before);
		} else {
			// append
			appendChildToContainer(hostParent, finishedWork.stateNode);
		}

		return;
	}
	// 当前节点不是host类型可能是函数组件，我们需要向下遍历找到真正的Host节点
	const child = finishedWork.child;
	if (child !== null) {
		insertOrAppendPlacementNodeIntoContainer(child, hostParent);
		// 兄弟节点也要插入到父结点上
		let sibling = child.sibling;

		while (sibling !== null) {
			insertOrAppendPlacementNodeIntoContainer(sibling, hostParent);
			sibling = sibling.sibling;
		}
	}
}
