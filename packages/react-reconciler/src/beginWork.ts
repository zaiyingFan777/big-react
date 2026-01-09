import { ReactElementType } from 'shared/ReactTypes';
import { FiberNode } from './fiber';
import { processUpdateQueue, UpdateQueue } from './updateQueue';
import {
	ContextProvider,
	Fragment,
	FunctionComponent,
	HostComponent,
	HostRoot,
	HostText
} from './workTags';
import { mountChildFibers, reconcileChildFibers } from './childFibers';
import { renderWithHooks } from './fiberHooks';
import { Lane } from './fiberLanes';
import { Ref } from './fiberFlags';
import { pushProvider } from './fiberContext';

export const beginWork = (wip: FiberNode, renderLane: Lane) => {
	// 递归中的递阶段
	// 比较ReactElement和fiberNode，返回子fiberNode
	switch (wip.tag) {
		case HostRoot:
			return updateHostRoot(wip, renderLane);
		case HostComponent:
			return updateHostComponent(wip);
		case HostText:
			// 没有beginWork的流程，因为他没有子节点
			// <p>唱跳Rap</p> 唱跳Rap是没有子节点的
			return null;
		case FunctionComponent:
			return updateFunctionComponent(wip, renderLane);
		case Fragment:
			return updateFragment(wip);
		case ContextProvider:
			return updateContextProvider(wip);
		default:
			if (__DEV__) {
				console.warn('beginWork未实现的类型');
			}
			break;
	}
	return null;
};

function updateContextProvider(wip: FiberNode) {
	const providerType = wip.type;
	const context = providerType._context;
	const newProps = wip.pendingProps;

	// <ctx.Provider value={1}>
	// 这里的newProps.value就是上面的value=1
	pushProvider(context, newProps.value);

	const nextChildren = newProps.children;
	reconcileChildren(wip, nextChildren);
	return wip.child;
}

function updateFragment(wip: FiberNode) {
	// [ReactElement, ReactElement]
	const nextChildren = wip.pendingProps;
	reconcileChildren(wip, nextChildren);
	return wip.child;
}

// 1.调用函数组件的函数
// 2.生成函数组件的子FiberNode
function updateFunctionComponent(wip: FiberNode, renderLane: Lane) {
	// 拿到函数组件的函数，并执行，得到函数组件的子ReactElement
	const nextChildren = renderWithHooks(wip, renderLane);
	// 对比子FiberNode和子ReactElement，生成函数组件的子FiberNode
	reconcileChildren(wip, nextChildren);

	return wip.child;
}

// 1.计算状态的最新值
// 2.创造子fiberNode
function updateHostRoot(wip: FiberNode, renderLane: Lane) {
	const baseState = wip.memoizedState;
	const updateQueue = wip.updateQueue as UpdateQueue<Element>;
	const pending = updateQueue.shared.pending;
	// 计算完毕后，将updateQueue.shared.pending置为null
	updateQueue.shared.pending = null;
	const { memoizedState } = processUpdateQueue(baseState, pending, renderLane);
	wip.memoizedState = memoizedState;

	const nextChildren = wip.memoizedState;
	reconcileChildren(wip, nextChildren);
	return wip.child;
}

// 1.创造子fiberNode
function updateHostComponent(wip: FiberNode) {
	// <div>123</div>
	// /*#__PURE__*/_jsx("div", {
	// 	children: "123"
	// });
	// ->
	// {
	// 	type: "div",
	// 	props: {
	// 		children: "123",
	// 	},
	// 	$$typeof: Symbol.for("react.element"),
	// 	key: null,
	// 	ref: null,
	// };
	const nextProps = wip.pendingProps;
	const nextChildren = nextProps.children;
	markRef(wip.alternate, wip);
	reconcileChildren(wip, nextChildren);
	return wip.child;
}

function reconcileChildren(wip: FiberNode, children?: ReactElementType) {
	// <A>
	// 	<B/>
	// </A>
	// 当进入A的beginWork时，通过对比B current fiberNode与B reactElement，生成B对应wip fiberNode。
	const current = wip.alternate;

	if (current !== null) {
		// mount时 hostRootFiber既有current又有wip，因此会打上标记插入
		// update
		wip.child = reconcileChildFibers(wip, current?.child, children);
	} else {
		// mount 不需要追踪副作用
		wip.child = mountChildFibers(wip, null, children);
	}
}

// 标记ref
function markRef(current: FiberNode | null, workInProgress: FiberNode) {
	const ref = workInProgress.ref;

	// mount时存在ref: current === null && ref !== null
	// update时ref引用变化: current !== null && current.ref !== ref
	if (
		(current === null && ref !== null) ||
		(current !== null && current.ref !== ref)
	) {
		workInProgress.flags |= Ref;
	}
}
