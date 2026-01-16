import {
	appendInitialChild,
	Container,
	createInstance,
	createTextInstance,
	Instance
} from 'hostConfig';
import { FiberNode } from './fiber';
import { NoFlags, Ref, Update, Visibility } from './fiberFlags';
import {
	HostRoot,
	HostText,
	HostComponent,
	FunctionComponent,
	Fragment,
	ContextProvider,
	SuspenseComponent,
	OffscreenComponent,
	MemoComponent
} from './workTags';
import { popProvider } from './fiberContext';
import { popSuspenseHandler } from './suspenseContext';
import { mergeLanes, NoLanes } from './fiberLanes';

// 标记ref
function markRef(fiber: FiberNode) {
	fiber.flags |= Ref;
}

function markUpdate(fiber: FiberNode) {
	fiber.flags |= Update;
}

// 1.对于Host类型的fiberNode：构建离屏dom树
export const completeWork = (wip: FiberNode) => {
	// 递归中的归阶段
	// <div id="id" className="class">123</div>
	// props:
	// {
	// 	id: "id",
	// 	className: "class",
	// 	children: "123"
	// }
	const newProps = wip.pendingProps;
	const current = wip.alternate;

	switch (wip.tag) {
		case HostComponent:
			if (current !== null && wip.stateNode) {
				// * update
				// wip.stateNode保存的是dom节点
				// * 属性变化标记Update
				// 1.判断props是否变化 {onClick: xx} => {onClick: xxx}、className a => b、styles属性变化
				// 1.1对于HostComponent类型的数据，我们把变化的属性放到fiber.updateQueue中
				// 1.2 fiberNode.updateQueue = [className, 'aaa', title, 'hahah']，第n项为哪个属性变了，第n+1向为该属性变化后的值是什么。
				// 1.3 n就是key(属性), n+1就是value
				// 2.变了打Update flag标记
				// 3.commitWork的时候commitUpdate方法增加HostComponent的case，并执行更新属性的操作
				// 3.1本应该在commitWork阶段更新，但是我们这里简单处理，在completeWork阶段更新
				// updateFiberProps(wip.stateNode, newProps);
				// * 简单处理不对比属性变化，直接标记有更新
				markUpdate(wip);
				// 标记ref
				if (current.ref !== wip.ref) {
					markRef(wip);
				}
			} else {
				// mount
				// 1. 构建DOM
				const instance = createInstance(wip.type, newProps);
				// 2. 将DOM插入到DOM树中
				appendAllChildren(instance, wip);
				wip.stateNode = instance;
				// 3. 标记ref
				if (wip.ref !== null) {
					markRef(wip);
				}
			}
			bubbleProperties(wip);
			return null;
		case HostText:
			if (current !== null && wip.stateNode) {
				// update
				const oldText = current.memoizedProps?.content;
				const newText = newProps.content;
				if (oldText !== newText) {
					markUpdate(wip);
				}
			} else {
				// 1. 构建DOM
				const instance = createTextInstance(newProps.content);
				wip.stateNode = instance;
			}
			bubbleProperties(wip);
			return null;
		case HostRoot:
		case FunctionComponent:
		case Fragment:
		case OffscreenComponent:
		case MemoComponent:
			bubbleProperties(wip);
			return null;
		case ContextProvider:
			// wip.type就是Provider
			const context = wip.type._context;
			popProvider(context);
			bubbleProperties(wip);
			return null;
		case SuspenseComponent:
			// completeWork的流程中出栈
			popSuspenseHandler();

			const offscreenFiber = wip.child as FiberNode;
			const isHidden = offscreenFiber.pendingProps.mode === 'hidden';
			const currentOffscreenFiber = offscreenFiber.alternate;
			if (currentOffscreenFiber !== null) {
				// update流程
				const wasHidden = currentOffscreenFiber.pendingProps.mode === 'hidden';

				if (isHidden !== wasHidden) {
					// 可见性变化
					offscreenFiber.flags |= Visibility;
					bubbleProperties(offscreenFiber);
				}
			} else if (isHidden) {
				// mount时hidden
				offscreenFiber.flags |= Visibility;
				bubbleProperties(offscreenFiber);
			}
			bubbleProperties(wip);
			return null;
		default:
			if (__DEV__) {
				console.warn('未处理的completeWork情况', wip);
			}
			break;
	}
};

// * 是将div插入到h3中
// function A() {
// 	return <div></div>
// }
// <h3><A/></h3>
// appendAllChildren是递归的过程，先往下递，再往上归，深度优先，层级遍历
// * 比如<div><span>123</span></div>，对于div，会找到他的子或孙是hostcomponent或者hosttext类型的，找到了挂载到div下面，然后去找他的兄弟节点，不会继续
// * 再往下找了，比如找到了span就不会去找123了，因为对于123是在span中去做的。
// appendAllChildren 的逻辑是「递归查找当前 Fiber 节点的所有子 Fiber 树中的 Host 类型节点（HostComponent/HostText） ，
// 并把它们挂载到当前 Fiber 对应的 DOM 上」—— 而 Host 类型节点的 DOM 是「层级挂载」的（123 的 text DOM 挂在 span 的 DOM 下，
// span 的 DOM 挂在 div 的 DOM 下），递归查找时会「跳过非 Host 类型节点，但不会重复插入已挂载的子 DOM」
function appendAllChildren(parent: Container | Instance, wip: FiberNode) {
	let node = wip.child;

	while (node !== null) {
		if (node.tag === HostComponent || node.tag === HostText) {
			// 找到了就将dom插入到parent中
			appendInitialChild(parent, node?.stateNode);
		} else if (node.child !== null) {
			// 如果node不是hostcomponent或者hosttext类型，继续往下查找
			node.child.return = node;
			node = node.child;
			continue;
		}

		// 往上归的base case，Node为wip说明递归结束。
		if (node === wip) {
			return;
		}

		while (node.sibling === null) {
			// 往上归的base case
			if (node.return === null || node.return === wip) {
				return;
			}
			node = node?.return;
		}
		// 查找兄弟节点
		node.sibling.return = node.return;
		node = node.sibling;
	}
}

// 利用completeWork向上遍历（归）的流程，将子fiberNode的flags冒泡到父fiberNode
function bubbleProperties(wip: FiberNode) {
	let subtreeFlags = NoFlags;
	let child = wip.child;

	let newChildLanes = NoLanes;

	while (child !== null) {
		// 当前节点子节点的subtreeFlags
		subtreeFlags |= child.subtreeFlags;
		// 当前节点子节点的flags
		subtreeFlags |= child.flags;

		// child.lanes child.childLanes
		newChildLanes = mergeLanes(
			newChildLanes,
			mergeLanes(child.lanes, child.childLanes)
		);

		child.return = wip;
		child = child.sibling;
	}
	wip.subtreeFlags |= subtreeFlags;
	wip.childLanes = newChildLanes;
}
