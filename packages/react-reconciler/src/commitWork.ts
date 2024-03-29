import {
	Container,
	Instance,
	appendChildToContainer,
	commitUpdate,
	insertChildToContainer,
	removeChild
} from 'hostConfig';
import { FiberNode, FiberRootNode, PendingPassiveEffects } from './fiber';
import {
	ChildDeletion,
	Flags,
	LayoutMask,
	MutationMask,
	NoFlags,
	PassiveEffect,
	PassiveMask,
	Placement,
	Ref,
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

// 包含Mutation、Layout阶段
export const commitEffects = (
	phrase: 'mutation' | 'layout',
	mask: Flags,
	callback: (fiber: FiberNode, root: FiberRootNode) => void
) => {
	return (finishedWork: FiberNode, root: FiberRootNode) => {
		nextEffect = finishedWork;

		while (nextEffect !== null) {
			// 向下遍历
			const child: FiberNode | null = nextEffect.child;

			// 先往下，再往上
			// 如果当前对应的nextEffect的subtreeFlags存在、同时subtreeFlags包含了MutationMask中的flags，并且子节点也存在
			// 备注：(nextEffect.subtreeFlags & (MutationMask | PassiveMask)) !== NoFlags
			if ((nextEffect.subtreeFlags & mask) !== NoFlags && child !== null) {
				// 继续向子节点遍历，因为 nextEffect.subtreeFlags & MutationMask !== NoFlags代表了子节点有可能存在对应的Mutation阶段的操作
				nextEffect = child;
			} else {
				// 到底了，或者我们找到的节点不包括subtreeFlags了，如果不包含subtreeFlags那么有可能包含flags，这时候我们向上遍历 DFS
				up: while (nextEffect !== null) {
					// commitMutaitonEffectsOnFiber(nextEffect, root);
					callback(nextEffect, root);
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
};

const commitMutaitonEffectsOnFiber = (
	finishedWork: FiberNode,
	root: FiberRootNode
) => {
	const { flags, tag } = finishedWork;

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
				commitDeletion(childToDelete, root);
			});
		}
		finishedWork.flags &= ~ChildDeletion;
	}
	// 更新的时候收集create回调/mount也在这里收集
	if ((flags & PassiveEffect) !== NoFlags) {
		// 收集副作用回调
		commitPassiveEffect(finishedWork, root, 'update');
		finishedWork.flags &= ~PassiveEffect;
	}
	// 解绑ref
	// layout阶段绑定新的ref, mutation解绑之前的ref
	if ((flags & Ref) !== NoFlags && tag === HostComponent) {
		safelyDetachRef(finishedWork);
	}
};

// 解绑ref
function safelyDetachRef(current: FiberNode) {
	const ref = current.ref;
	if (ref !== null) {
		if (typeof ref === 'function') {
			ref(null);
		} else {
			ref.current = null;
		}
	}
}

const commitLayoutEffectsOnFiber = (
	finishedWork: FiberNode,
	root: FiberRootNode
) => {
	const { flags, tag } = finishedWork;

	if ((flags & Ref) !== NoFlags && tag === HostComponent) {
		// layout阶段绑定新的ref, mutation解绑之前的ref
		safelyAttachRef(finishedWork);
		finishedWork.flags &= ~Ref;
	}
};

// 绑定ref
function safelyAttachRef(fiber: FiberNode) {
	const ref = fiber.ref;
	if (ref !== null) {
		const instance = fiber.stateNode;
		if (typeof ref === 'function') {
			ref(instance);
		} else {
			ref.current = instance;
		}
	}
}

// DFS，1.深度遍历找到含有XXXMask的flag的最低一层的fiberNode，或者到了叶子节点，然后执行commitMutaitonEffectsOnFiber，
// 2.找到兄弟节点 继续开始往下找，找不到则找父节点执行commitMutaitonEffectsOnFiber
// export const commitMutationEffects = (
// 	finishedWork: FiberNode,
// 	root: FiberRootNode
// ) => {
// 	nextEffect = finishedWork;

// 	while (nextEffect !== null) {
// 		// 向下遍历
// 		const child: FiberNode | null = nextEffect.child;

// 		// 先往下，再往上
// 		// 如果当前对应的nextEffect的subtreeFlags存在、同时subtreeFlags包含了MutationMask中的flags，并且子节点也存在
// 		if (
// 			(nextEffect.subtreeFlags & (MutationMask | PassiveMask)) !== NoFlags &&
// 			child !== null
// 		) {
// 			// 继续向子节点遍历，因为 nextEffect.subtreeFlags & MutationMask !== NoFlags代表了子节点有可能存在对应的Mutation阶段的操作
// 			nextEffect = child;
// 		} else {
// 			// 到底了，或者我们找到的节点不包括subtreeFlags了，如果不包含subtreeFlags那么有可能包含flags，这时候我们向上遍历 DFS
// 			up: while (nextEffect !== null) {
// 				commitMutaitonEffectsOnFiber(nextEffect, root);
// 				const sibling: FiberNode | null = nextEffect.sibling;

// 				// 如果有兄弟节点，就向下遍历兄弟节点，打破up while
// 				if (sibling !== null) {
// 					nextEffect = sibling;
// 					break up;
// 				}

// 				// 如果sibling为null，向上遍历,找到父节点，
// 				nextEffect = nextEffect.return;
// 			}
// 		}
// 	}
// };
export const commitMutationEffects = commitEffects(
	'mutation',
	MutationMask | PassiveMask,
	commitMutaitonEffectsOnFiber
);

export const commitLayoutEffects = commitEffects(
	'layout',
	LayoutMask | PassiveMask,
	commitLayoutEffectsOnFiber
);

// 收集回调的方法
function commitPassiveEffect(
	fiber: FiberNode,
	root: FiberRootNode,
	type: keyof PendingPassiveEffects // unmount或者update
) {
	// update unmount
	if (
		fiber.tag !== FunctionComponent ||
		(type === 'update' && (fiber.flags & PassiveEffect) === NoFlags)
	) {
		// 不是函数组件 或者 当前是更新但是fiber没有PassiveEffect 不需要收集副作用
		return;
	}
	// 获取effect环状链表
	const updateQueue = fiber.updateQueue as FCUpdateQueue<any>;
	if (updateQueue !== null) {
		if (updateQueue.lastEffect === null && __DEV__) {
			console.log('当FC存在PassiveEffect flag时， 不应该不存在effect');
		}
		root.pendingPassiveEffects[type].push(updateQueue.lastEffect as Effect);
	}
}

// 遍历effect链表
function commitHookEffectList(
	flags: Flags,
	lastEffect: Effect,
	callback: (effect: Effect) => void // 每遍历一个effect触发一个回调
) {
	// 获取第一个effect
	let effect = lastEffect.next as Effect;

	do {
		if ((effect.tag & flags) === flags) {
			callback(effect);
		}
		effect = effect.next as Effect;
	} while (effect !== lastEffect.next);
}

// 组件卸载
// 对于unmount时，effect链表的遍历流程
export function commitHookEffectListUnmount(flags: Flags, lastEffect: Effect) {
	commitHookEffectList(flags, lastEffect, (effect) => {
		// 获取effect的destory函数
		const destroy = effect.destory;
		if (typeof destroy === 'function') {
			destroy();
		}
		// 对于函数组件，走到这，应该是要卸载了。create就不会被触发了，所以移除掉HookHasEffect，这样就能防止执行副作用时触发更新的create、destory再触发一遍
		effect.tag &= ~HookHasEffect;
	});
}

// 触发上次更新的destory，比如Num变化 useEffect里的return的函数
// 对于destory时，effect链表的遍历流程
export function commitHookEffectListDestory(flags: Flags, lastEffect: Effect) {
	commitHookEffectList(flags, lastEffect, (effect) => {
		// 获取effect的destory函数
		const destroy = effect.destory;
		if (typeof destroy === 'function') {
			destroy();
		}
	});
}

// 触发这次更新的create
export function commitHookEffectListCreate(flags: Flags, lastEffect: Effect) {
	commitHookEffectList(flags, lastEffect, (effect) => {
		// 获取effect的Create函数
		const create = effect.create;
		if (typeof create === 'function') {
			// create函数执行完，return出来的函数就是destory
			effect.destory = create();
		}
	});
}

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

// 记录要被删除的节点
function recordHostChildrenToDelete(
	childrenToDelete: FiberNode[],
	unmountFiber: FiberNode
) {
	// 1. 找到第一个root host节点(childrenToDelete数组中留下来的都是同一级的节点)
	// 找到最后一个节点
	const lastOne = childrenToDelete[childrenToDelete.length - 1];

	if (!lastOne) {
		// 我们第一次push进去的节点
		childrenToDelete.push(unmountFiber);
	} else {
		// 判断是不是lastOne的兄弟节点
		let node = lastOne.sibling;
		while (node !== null) {
			// 2. 每找到一个host节点，判断下这个节点是不是 1 找到那个节点的兄弟节点，fragment
			// 像这种我们要删除fragment的时候，因为下面有两个p都需要被删除
			// <div>
			//   <>
			// 	   <p>xxx</p>
			// 	   <p>yyy</p>
			//   </>
			// </div>
			if (unmountFiber === node) {
				childrenToDelete.push(unmountFiber);
			}
			node = node.sibling;
		}
	}
}

// 包含组件卸载
// 递归子树的操作
function commitDeletion(childToDelete: FiberNode, root: FiberRootNode) {
	// 找到这个要被删除的fiberNode(子树)的根HostComponent
	const rootChildrenToDelete: FiberNode[] = [];

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
				recordHostChildrenToDelete(rootChildrenToDelete, unmountFiber);
				// 组件卸载，解绑之前的ref
				safelyDetachRef(unmountFiber);
				return;
			case HostText:
				recordHostChildrenToDelete(rootChildrenToDelete, unmountFiber);
				return;
			case FunctionComponent:
				// TODO 解绑ref
				// useEffect unmount
				// 删除节点的时候收集destory的副作用到unmount数组里
				commitPassiveEffect(unmountFiber, root, 'unmount');
				return;
			default:
				if (__DEV__) {
					console.warn('未处理的unmount类型', unmountFiber);
				}
		}
	});

	// 移除rootChildrenToDelete数组的DOM
	if (rootChildrenToDelete.length) {
		// 找到要删除的子树的根fiber节点的host类型的节点
		const hostParent = getHostParent(childToDelete);
		if (hostParent !== null) {
			// 遍历rootChildrenToDelete的每一个节点，调用romoveChild删除
			rootChildrenToDelete.forEach((node) => {
				// 在hostParent下面删除掉这个子树的根rootHostNode host类型的节点
				removeChild(node.stateNode, hostParent);
			});
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

	// Placement同时对应：
	// 移动
	// 插入

	// 对于插入操作，之前对应的DOM方法是parentNode.appendChild，现在为了实现移动操作，需要支持parentNode.insertBefore。
	// parentNode.insertBefore需要找到「目标兄弟Host节点」，要考虑2个因素：
	// ·可能并不是目标fiber的直接兄弟节点
	// 情况1: 对于A组件他的兄弟节点是b组件的div，从B往下找
	// <A/><B/>
	// function B() {
	// 	return <div/>;
	// }

	// 情况2：对于A组件他的父节点的兄弟节点是div，从A往上找
	// <App/><div/>
	// function App() {
	// 	return <A/>;
	// }

	// ·不稳定的Host节点不能作为「目标兄弟Host节点」

	// 插入
	// host sibling
	const sibling = getHostSibling(finishedWork);

	// finishedWork ~~ DOM append parent DOM
	// 找到finishedWork对应的DOM
	// 将finishedWork插入到parent
	if (hostParent !== null) {
		insertOrAppendPlacementNodeIntoContainer(finishedWork, hostParent, sibling);
	}
};

// 找到host sibling
function getHostSibling(fiber: FiberNode) {
	let node: FiberNode = fiber;

	// 先找同级别sibling，如果sibling不是host类型，则从sibling往下找
	findSibling: while (true) {
		// 同级没有兄弟节点，需要向上找
		while (node.sibling === null) {
			const parent = node.return;

			if (
				parent === null ||
				parent.tag === HostComponent ||
				parent.tag === HostRoot
			) {
				// 没找着
				return null;
			}
			// 向上遍历
			node = parent;
		}
		// 同级有兄弟节点找兄弟节点
		node.sibling.return = node.return;
		node = node.sibling;

		while (node.tag !== HostText && node.tag !== HostComponent) {
			// 向下遍历，找他的子孙节点的host类型
			// 排除不稳定节点，比如B A(Placement)，这时候我们，插入B，找他的兄弟节点A，但是A也是插入就不稳定
			if ((node.flags & Placement) !== NoFlags) {
				continue findSibling;
			}
			// 到底了
			if (node.child === null) {
				continue findSibling;
			} else {
				node.child.return = node;
				node = node.child;
			}
		}

		if ((node.flags & Placement) === NoFlags) {
			// 这时候node是稳定的，并且是HostText或者HostComponent类型，
			return node.stateNode;
		}
	}
}

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

function insertOrAppendPlacementNodeIntoContainer(
	finishedWork: FiberNode,
	hostParent: Container,
	before?: Instance
) {
	// (finishedWork)不一定是host类型，通过fiber向下遍历找到他宿主环境（host）的fiber，然后把他append到host parent下
	if (finishedWork.tag === HostComponent || finishedWork.tag === HostText) {
		if (before) {
			// 在before前插入
			insertChildToContainer(finishedWork.stateNode, hostParent, before);
		} else {
			appendChildToContainer(hostParent, finishedWork.stateNode);
		}
		return;
	}
	// 向下寻找
	const child = finishedWork.child;
	if (child !== null) {
		insertOrAppendPlacementNodeIntoContainer(child, hostParent);
		// child的兄弟节点也要插入进去
		let sibling = child.sibling;

		while (sibling !== null) {
			insertOrAppendPlacementNodeIntoContainer(sibling, hostParent);
			sibling = sibling.sibling;
		}
	}
}
