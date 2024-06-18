// commit阶段的方法

import {
	appendChildToContainer,
	commitUpdate,
	Container,
	insertChildToContainer,
	Instance,
	removeChild
} from 'hostConfig';
import { FiberNode, FiberRootNode, PendingPassiveEffects } from './fiber';
import {
	ChildDeletion,
	Flags,
	MutationMask,
	NoFlags,
	PassiveEffect,
	PassiveMask,
	Placement,
	Update
} from './fiberFlags';
import {
	FunctionComponent,
	HostComponent,
	HostRoot,
	HostText
} from './workTags';
import { Effect, FCUpdateQueue } from './fiberHooks';
import { HookHasEffect } from './hookEffectTags';

let nextEffect: FiberNode | null = null;

// mutation时期执行的方法
// finishedWork: 生成的wip fiberNode (hostFiberRoot)
export const commitMutationEffects = (
	finishedWork: FiberNode,
	root: FiberRootNode
) => {
	nextEffect = finishedWork;

	while (nextEffect !== null) {
		// 向下遍历
		const child: FiberNode | null = nextEffect.child;
		if (
			(nextEffect.subtreeFlags & (MutationMask | PassiveMask)) !== NoFlags &&
			child !== null
		) {
			// 继续向子节点遍历，说明子节点有Mutation阶段的操作
			nextEffect = child;
		} else {
			// 说明遍历到底了，或者找到的节点没有subtreeFlags了(或者说没有subtreeFlags了，但可能有flags)
			// <div><span>111</span></div>  假设span的flag为Placement，div的subtreeFlags为1(div没有其他的flag)，所以我们找到span因为他没有subtreeflag但是有flag，需要插入
			// 这时候我们需要向上遍历 dfs
			up: while (nextEffect !== null) {
				// 执行Placement、Update、ChildDeletion、PassiveEffect等操作
				commitMutationEffectsOnFiber(nextEffect, root);
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

const commitMutationEffectsOnFiber = (
	finishedWork: FiberNode,
	root: FiberRootNode
) => {
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
				commitDeletion(childToDelete, root);
			});
		}
		// 移除标记
		finishedWork.flags &= ~ChildDeletion;
	}
	// falg PassiveEffect
	if ((flags & PassiveEffect) !== NoFlags) {
		// 收集effect回调
		commitPassiveEffect(finishedWork, root, 'update');
		// 收集完，finishedWork.flags移除PassiveEffect
		finishedWork.flags &= ~PassiveEffect;
	}
};

function commitPassiveEffect(
	fiber: FiberNode,
	root: FiberRootNode,
	type: keyof PendingPassiveEffects
) {
	// update unmount
	if (
		fiber.tag !== FunctionComponent ||
		(type === 'update' && (fiber.flags & PassiveEffect) === NoFlags)
	) {
		// 非函数组件 或者 如果type是update，但是fiberNode不包含PassiveEffect【type为update时，fiberNode需要有PassiveEffect标记】
		return;
	}
	// 找到fc中最后一个effect
	const updateQueue = fiber.updateQueue as FCUpdateQueue<any>;
	if (updateQueue !== null) {
		if (updateQueue.lastEffect === null && __DEV__) {
			console.error('当FC存在PassiveEffect flag时，不应该不存在effect');
		}
		// 将fiber的effect环状链表添加到root.pendingPassiveEffects[type]队尾
		// 到时候遍历环状链表，就可以执行这个函数组件所有需要执行的副作用
		root.pendingPassiveEffects[type].push(updateQueue.lastEffect as Effect);
	}
}

// 遍历updateQueue的环状链表的方法
function commitHookEffectList(
	flags: Flags,
	lastEffect: Effect,
	callback: (effect: Effect) => void
) {
	// 获取到第一个effect
	let effect = lastEffect.next as Effect;

	do {
		if ((effect.tag & flags) === flags) {
			// effect.destroy是effect的销毁函数
			// effect.destroy执行后，effect.destroy就变成了undefined
			callback(effect);
		}
		effect = effect.next as Effect;
	} while (effect !== lastEffect.next);
}

// 对于unmount，卸载的组件执行destroy回调，并且移除effect.tag上的HookHasEffect
export function commitHookEffectListUnmount(flags: Flags, lastEffect: Effect) {
	commitHookEffectList(flags, lastEffect, (effect) => {
		const destroy = effect.destroy;
		if (typeof destroy === 'function') {
			// 函数组件卸载才会走这里
			destroy();
		}
		// 函数组件后续卸载后，后续的这个函数组件的useEffect的create就不会触发了
		effect.tag &= ~HookHasEffect;
	});
}

// 执行destroy回调
export function commitHookEffectListDestroy(flags: Flags, lastEffect: Effect) {
	commitHookEffectList(flags, lastEffect, (effect) => {
		const destroy = effect.destroy;
		if (typeof destroy === 'function') {
			// 函数组件卸载才会走这里
			destroy();
		}
	});
}

// 执行create回调
export function commitHookEffectListCreate(flags: Flags, lastEffect: Effect) {
	commitHookEffectList(flags, lastEffect, (effect) => {
		const create = effect.create;
		if (typeof create === 'function') {
			// create回调执行完，他的返回值就是destroy
			effect.destroy = create();
		}
	});
}

// 记录要被删除的子节点的根host节点
function recordHostChildrenToDelete(
	childrenToDelete: FiberNode[],
	unmountFiber: FiberNode
) {
	// 1.找到第一个root host节点
	// 最后一个节点
	const lastOne = childrenToDelete[childrenToDelete.length - 1];

	if (!lastOne) {
		// 如果还没有被记录，我们将umountFiber放到childrenToDelete数组中
		childrenToDelete.push(unmountFiber);
	} else {
		// 已经被记录过了，我们需要判断是不是lastOne的兄弟节点
		let node = lastOne.sibling;
		while (node !== null) {
			// 2.每找到一个host节点，判断下这个节点是不是第一步找到的哪个节点的兄弟节点
			if (unmountFiber === node) {
				// 是lastOne的兄弟节点
				childrenToDelete.push(unmountFiber);
			}
			node = node.sibling;
		}
	}
}

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

/**
 * 后续备注：
 * childdeletion删除dom的逻辑：
 * 1.找到子树的根Host节点
 * 2.找到子树对应的父级Host节点
 * 3.从父级Host节点中删除子树根Host节点
 * <div><p>xxx</p></div> 假设我们要删除p，xxx可能是嵌套很深的级,找到p，只要删除p，p的子孙也会被删除，因此找到了P div，在div中删除p
 * 考虑删除Fragment后，子树的根Host节点可能存在多个：
 * 如果我们删除fragment,他的父host节点有一个(div)，但是他的子有多个host节点(p)，多个p都需要被移除。因此需要找到fragment下的所有根host节点
 * <div>
 *  <>
 *   <p>xxx</p>
 *   <p>yyy</p>
 *  </>
 * </div>
 */
function commitDeletion(childToDelete: FiberNode, root: FiberRootNode) {
	// 子树的根HostComponent类型的节点
	const rootChildrenToDelete: FiberNode[] = [];

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
				recordHostChildrenToDelete(rootChildrenToDelete, unmountFiber);
				// TODO 解绑ref
				return;
			case HostText:
				// 这里会找到childToDelete下面第一个host类型的子节点并删除
				recordHostChildrenToDelete(rootChildrenToDelete, unmountFiber);
				return;
			case FunctionComponent:
				// TODO useEffect unmount的处理、解绑ref
				// TODO1: 组件删除，收集组件的useEffect destroy函数
				commitPassiveEffect(unmountFiber, root, 'unmount');
				return;
			default:
				if (__DEV__) {
					console.warn('未处理的unmount类型', unmountFiber);
				}
		}
	});

	// 移除rootHostNode的DOM
	if (rootChildrenToDelete.length) {
		// hostParent是我们要删掉的子树中的根fiber节点的host类型的parent
		const hostParent = getHostParent(childToDelete);
		if (hostParent !== null) {
			rootChildrenToDelete.forEach((node) => {
				// 我们在hostParent下面删除这个子树的根host类型的节点
				removeChild(node.stateNode, hostParent);
			});
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
		// 如果sibling为null调用appendChild插入到最后，如果不为null则插入到sibling之前
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
		insertOrAppendPlacementNodeIntoContainer(child, hostParent, before);
		// 兄弟节点也要插入到父结点上
		let sibling = child.sibling;

		while (sibling !== null) {
			insertOrAppendPlacementNodeIntoContainer(sibling, hostParent, before);
			sibling = sibling.sibling;
		}
	}
}
