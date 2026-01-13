import { ReactElementType } from 'shared/ReactTypes';
import {
	createFiberFromFragment,
	createFiberFromOffscreen,
	createWorkInProgress,
	FiberNode,
	OffscreenProps
} from './fiber';
import { processUpdateQueue, UpdateQueue } from './updateQueue';
import {
	ContextProvider,
	Fragment,
	FunctionComponent,
	HostComponent,
	HostRoot,
	HostText,
	OffscreenComponent,
	SuspenseComponent
} from './workTags';
import { mountChildFibers, reconcileChildFibers } from './childFibers';
import { renderWithHooks } from './fiberHooks';
import { Lane } from './fiberLanes';
import {
	ChildDeletion,
	DidCapture,
	NoFlags,
	Placement,
	Ref
} from './fiberFlags';
import { pushProvider } from './fiberContext';
import { pushSuspenseHandler } from './suspenseContext';

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
		case SuspenseComponent:
			return updateSuspenseComponent(wip);
		case OffscreenComponent:
			return updateOffscreenComponent(wip);
		default:
			if (__DEV__) {
				console.warn('beginWork未实现的类型');
			}
			break;
	}
	return null;
};

function updateOffscreenComponent(workInProgress: FiberNode) {
	const nextProps = workInProgress.pendingProps;
	const nextChildren = nextProps.children;
	reconcileChildren(workInProgress, nextChildren);
	return workInProgress.child;
}

function updateSuspenseComponent(workInProgress: FiberNode) {
	const current = workInProgress.alternate;
	const nextProps = workInProgress.pendingProps;

	// 是否展示fallback，即正常流程还是挂起流程
	let showFallback = false;
	// 当前是否为挂起的状态, true为挂起
	const didSuspend = (workInProgress.flags & DidCapture) !== NoFlags;

	// 挂起状态
	if (didSuspend) {
		showFallback = true;
		// 移除DidCapture标记
		workInProgress.flags &= ~DidCapture;
	}
	// 获取Suspense的两个child
	// <Suspense fallback={<div>loading...</div>}>
	//   <Cpn/>
	// </Suspense>
	// 1. Cpn
	const nextPrimaryChildren = nextProps.children;
	// 2. fallback
	const nextFallbackChildren = nextProps.fallback;
	// beginwork流程中将suspense的fiber添加到存放suspense的栈中
	pushSuspenseHandler(workInProgress);

	if (current === null) {
		// 1. mount流程
		if (showFallback) {
			// 1.1 mount的挂起流程
			return mountSuspenseFallbackChildren(
				workInProgress,
				nextPrimaryChildren,
				nextFallbackChildren
			);
		} else {
			// 1.2 mount的正常流程
			return mountSuspensePrimaryChildren(workInProgress, nextPrimaryChildren);
		}
	} else {
		// 2. update流程
		if (showFallback) {
			// 2.1 update的挂起流程
			return updateSuspenseFallbackChildren(
				workInProgress,
				nextPrimaryChildren,
				nextFallbackChildren
			);
		} else {
			// 2.2 update的正常流程
			return updateSuspensePrimaryChildren(workInProgress, nextPrimaryChildren);
		}
	}
}

// 1.2 mount时的正常流程
function mountSuspensePrimaryChildren(
	workInProgress: FiberNode,
	primaryChildren: any
) {
	const primaryChildProps: OffscreenProps = {
		mode: 'visible',
		children: primaryChildren
	};
	const primaryChildFragment = createFiberFromOffscreen(primaryChildProps);
	workInProgress.child = primaryChildFragment;
	primaryChildFragment.return = workInProgress;
	return primaryChildFragment;
}

// 1.1 mount时的挂起流程
// 需要创建Offscreen的fiber，最终beginwork返回的是fragment的fiber
function mountSuspenseFallbackChildren(
	workInProgress: FiberNode,
	primaryChildren: any,
	fallbackChildren: any
) {
	const primaryChildProps: OffscreenProps = {
		mode: 'hidden',
		children: primaryChildren
	};
	const primaryChildFragment = createFiberFromOffscreen(primaryChildProps);
	const fallbackChildFragment = createFiberFromFragment(fallbackChildren, null);
	// 父组件Suspense已经mount，所以需要fallback标记Placement
	fallbackChildFragment.flags |= Placement;

	primaryChildFragment.return = workInProgress;
	fallbackChildFragment.return = workInProgress;
	primaryChildFragment.sibling = fallbackChildFragment;
	workInProgress.child = primaryChildFragment;

	return fallbackChildFragment;
}

// 2.2 update时的正常流程
function updateSuspensePrimaryChildren(
	workInProgress: FiberNode,
	primaryChildren: any
) {
	const current = workInProgress.alternate as FiberNode;
	const currentPrimaryChildFragment = current.child as FiberNode;
	const currentFallbackChildFragment: FiberNode | null =
		currentPrimaryChildFragment.sibling;

	const primaryChildProps: OffscreenProps = {
		mode: 'visible',
		children: primaryChildren
	};

	const primaryChildFragment = createWorkInProgress(
		currentPrimaryChildFragment,
		primaryChildProps
	);
	primaryChildFragment.return = workInProgress;
	primaryChildFragment.sibling = null;
	workInProgress.child = primaryChildFragment;

	if (currentFallbackChildFragment !== null) {
		const deletions = workInProgress.deletions;
		if (deletions === null) {
			workInProgress.deletions = [currentFallbackChildFragment];
			workInProgress.flags |= ChildDeletion;
		} else {
			deletions.push(currentFallbackChildFragment);
		}
	}

	return primaryChildFragment;
}

// 2.1 update时的挂起流程
function updateSuspenseFallbackChildren(
	workInProgress: FiberNode,
	primaryChildren: any,
	fallbackChildren: any
) {
	const current = workInProgress.alternate as FiberNode;
	// 获取current的Offscreen
	const currentPrimaryChildFragment = current.child as FiberNode;
	// 获取current的Fallback
	const currentFallbackChildFragment: FiberNode | null =
		currentPrimaryChildFragment.sibling;

	const primaryChildProps: OffscreenProps = {
		mode: 'hidden',
		children: primaryChildren
	};
	// 复用Offscreen fiber
	const primaryChildFragment = createWorkInProgress(
		currentPrimaryChildFragment,
		primaryChildProps
	);
	let fallbackChildFragment;

	if (currentFallbackChildFragment !== null) {
		// 可以复用
		fallbackChildFragment = createWorkInProgress(
			currentFallbackChildFragment,
			fallbackChildren
		);
	} else {
		// 新建，因此需要给fallback打上标记
		fallbackChildFragment = createFiberFromFragment(fallbackChildren, null);
		fallbackChildFragment.flags |= Placement;
	}
	fallbackChildFragment.return = workInProgress;
	primaryChildFragment.return = workInProgress;
	primaryChildFragment.sibling = fallbackChildFragment;
	workInProgress.child = primaryChildFragment;

	return fallbackChildFragment;
}

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

	// 使用了use（但是没有被suspense包裹），从而没有进入commit流程, 那么fiber树没有反转，因此current没有保存memoizedState
	// 因此我们将memoizedState保存到current.memoizedState 一份
	const current = wip.alternate;
	if (current !== null) {
		current.memoizedState = memoizedState;
	}

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
