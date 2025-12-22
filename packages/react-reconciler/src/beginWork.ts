import { ReactElementType } from 'shared/ReactTypes';
import { FiberNode } from './fiber';
import { processUpdateQueue, UpdateQueue } from './updateQueue';
import {
	Fragment,
	FunctionComponent,
	HostComponent,
	HostRoot,
	HostText
} from './workTags';
import { mountChildFibers, reconcileChildFibers } from './childFibers';
import { renderWithHooks } from './fiberHooks';

export const beginWork = (wip: FiberNode) => {
	// 递归中的递阶段
	// 比较ReactElement和fiberNode，返回子fiberNode
	switch (wip.tag) {
		case HostRoot:
			return updateHostRoot(wip);
		case HostComponent:
			return updateHostComponent(wip);
		case HostText:
			// 没有beginWork的流程，因为他没有子节点
			// <p>唱跳Rap</p> 唱跳Rap是没有子节点的
			return null;
		case FunctionComponent:
			return updateFunctionComponent(wip);
		case Fragment:
			return updateFragment(wip);
		default:
			if (__DEV__) {
				console.warn('beginWork未实现的类型');
			}
			break;
	}
	return null;
};

function updateFragment(wip: FiberNode) {
	// [ReactElement, ReactElement]
	const nextChildren = wip.pendingProps;
	reconcileChildren(wip, nextChildren);
	return wip.child;
}

// 1.调用函数组件的函数
// 2.生成函数组件的子FiberNode
function updateFunctionComponent(wip: FiberNode) {
	// 拿到函数组件的函数，并执行，得到函数组件的子ReactElement
	const nextChildren = renderWithHooks(wip);
	// 对比子FiberNode和子ReactElement，生成函数组件的子FiberNode
	reconcileChildren(wip, nextChildren);

	return wip.child;
}

// 1.计算状态的最新值
// 2.创造子fiberNode
function updateHostRoot(wip: FiberNode) {
	const baseState = wip.memoizedState;
	const updateQueue = wip.updateQueue as UpdateQueue<Element>;
	const pending = updateQueue.shared.pending;
	// 计算完毕后，将updateQueue.shared.pending置为null
	updateQueue.shared.pending = null;
	const { memoizedState } = processUpdateQueue(baseState, pending);
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
