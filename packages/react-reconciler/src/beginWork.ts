// 比较ReactElement和FiberNode生成子fiberNode
// <A>
// 	<B/>
// </A>
// 当进入A的beginWork时，通过对比B current fiberNode与B reactElement，生成B对应wip fiberNode。
// 在此过程中最多会标记2类与「结构变化」相关的flags：
// Placement
// 插入： a -> ab     b标记Placement
// 移动： abc -> bca  a标记Placement
// ChildDeletion
// 删除： ul>li*3 -> ul>li*1  标记两个li的ChildDeletion
// 不包含与「属性变化」相关的flag：Update
// <img title="鸡" /> -> <img title="你太美" />

import { ReactElementType } from 'shared/ReactTypes';
import { FiberNode } from './fiber';
import { processUpdateQueue, UpdateQueue } from './updateQueue';
import { HostComponent, HostRoot, HostText } from './workTags';
import { mountChildFibers, reconcileChildFibers } from './childFibers';

// 递归中的递阶段
export const beginWork = (wip: FiberNode) => {
	// 比较，返回子fiberNode
	switch (wip.tag) {
		case HostRoot:
			// HostRoot的beginWork工作流程
			// 1.计算状态的最新值
			// 2.创造子fiberNode
			return updateHostRoot(wip);
		case HostComponent:
			// HostComponent的beginWork工作流程
			// 1.创造子fiberNode
			return updateHostComponent(wip);
		case HostText:
			// HostText没有beginWork工作流程（因为他没有子节点）
			// <p>唱跳Rap</p>
			return null; // 递阶段完事，开始归阶段
		default:
			if (__DEV__) {
				console.warn('beginWork未实现的类型', wip.tag);
			}
			break;
	}
	return null;
};

// 下面这句话的children都是ReactElement
// 无论hostRootFiber的children总是在fiber.memoizedState上, hostComponent的children在pendingProps 这样就是为了父fiber beginWork的时候根据对比儿子 current fiberNode与儿子 reactElement
// 从而得到儿子wip fiberNode

// HostRootFiber的beginwork流程
function updateHostRoot(wip: FiberNode) {
	// 1.计算状态最新值
	const baseState = wip.memoizedState; // 首屏渲染不存在
	const updateQueue = wip.updateQueue as UpdateQueue<Element>;
	const pending = updateQueue.shared.pending;
	// 清空updateQueue
	// 这里注意一下
	// var a = {a:1} var b = {x: a}
	// b.x = null => b.x输出null
	// a = null => a输出null  但是我们创建的对象{a:1}还会在内存里，然后就进入了垃圾回收机制的范畴
	// 这里pending指向了updateQueue.shared.pending
	// 然后又将updateQueue.shared.pending指向了null
	updateQueue.shared.pending = null;
	// 计算状态
	const { memoizedState } = processUpdateQueue(baseState, pending);
	// 将最新的状态赋值给wip，这里memoizedState是根组件<App/>jsx生成的ReactElement
	wip.memoizedState = memoizedState;

	// render(<App/>) nextChildren为<App/>jsx生成的ReactElement
	const nextChildren = wip.memoizedState;
	// 返回我们需要的App对应的fiberNode(子fiber)
	reconcileChildren(wip, nextChildren);
	return wip.child;
}

// HostComponent的beginWork的流程
function updateHostComponent(wip: FiberNode) {
	// <div><span>111</span></div> span在div的ReactElement的children属性里面 {children} =>  这个children在div的ReactElement的props里
	// <div><span>111</span></div>
	// => jsx
	// /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "111"));
	// => ReactElement
	// {
	// 	$$typeof: Symbol.for('react.element'),
	// 	key: null,
	// 	props: {
	// 		children: {
	// 			$$typeof: Symbol.for('react.element'),
	// 			key: null,
	// 			props: {
	// 				children: "111"
	// 			},
	// 			ref: null,
	// 			type: "span",
	// 			__mark: "big-react"
	// 		}
	// 	},
	// 	ref: null,
	// 	type: "div",
	// 	__mark: "big-react"
	// }
	const nextProps = wip.pendingProps;
	const nextChildren = nextProps.children;
	reconcileChildren(wip, nextChildren);
	return wip.child;
}

function reconcileChildren(wip: FiberNode, children?: ReactElementType) {
	// <A>
	// 	<B/>
	// </A>
	// 当进入A的beginWork时，通过对比B current fiberNode与B reactElement(在这里是children，从wip.pendingProps.children取出来的)，生成B对应wip fiberNode。
	// 先找到wip父节点的current
	const current = wip.alternate;

	if (current !== null) {
		// update
		// 首屏渲染 hostRootFiber走这里，因为他有current，被标记placement，执行一次dom操作(离屏dom树插入到页面上)
		wip.child = reconcileChildFibers(wip, current?.child, children);
	} else {
		// mount
		// 首屏渲染 性能优化，构建一个离屏dom树对根节点执行一次Placement，而不是每个dom都标记Placement
		// 首屏渲染：除了hostRootFiber，其他fiber走这里，避免每个fiber都标记Placement
		wip.child = mountChildFibers(wip, null, children);
	}
}
