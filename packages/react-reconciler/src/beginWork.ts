// 递归中的递阶段

import { ReactElementType } from 'shared/ReactTypes';
import { FiberNode } from './fiber';
import { UpdateQueue, processUpdateQueue } from './updateQueue';
import {
	Fragment,
	FunctionComponent,
	HostComponent,
	HostRoot,
	HostText
} from './workTags';
import { reconcileChildFibers, mountChildFibers } from './childFibers';
import { renderWithHooks } from './fiberHooks';
import { Lane } from './fiberLanes';

// 对于如下结构的reactElement：
// <A>
//  <B/>
// </A>
// 当进入A的beginWork时，通过对比B current fiberNode与B reactElement，生成B对应wip fiberNode。
// 在此过程中最多会标记2类与「结构变化」相关的flags：
// Placement
// 插入： a -> ab
// 移动： abc -> bca
// ChildDeletion
// 删除： ul>li*3 -> ul>li*1
// 不包含与「属性变化」相关的flag：Update
// <img title="鸡" /> -> <img title="你太美" />

// 备注：对于不同类型的 fiber，state 对他的概念不同。  对于FC，state是 hooks链表， 对于 HostRoot， state 是 挂载的组件， 对于 ClassComponent，state是 状态
export const beginWork = (wip: FiberNode, renderLane: Lane) => {
	// 比较ReactElement与fiberNode对比，返回子fiberNode
	switch (wip.tag) {
		case HostRoot:
			return updateHostRoot(wip, renderLane);
		case HostComponent:
			return updateHostComponent(wip);
		case HostText:
			// hostText没有beginWork工作流程（因为他没有子节点）
			// <p>唱跳Rap</p> 唱跳Rap文本节点对应的就是hostText类型，hostText没有子节点
			return null;
		case FunctionComponent:
			return updateFunctionComponent(wip, renderLane);
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

// fragment组件
function updateFragment(wip: FiberNode) {
	const nextChildren = wip.pendingProps;
	reconcileChildren(wip, nextChildren);
	return wip.child;
}

// 函数组件
function updateFunctionComponent(wip: FiberNode, renderLane: Lane) {
	// App的children就是img组件，如何得到img组件，调用App()组件即可
	// function App() {
	// 	return <img/>;
	// }
	const nextChildren = renderWithHooks(wip, renderLane);
	reconcileChildren(wip, nextChildren);
	return wip.child;
}

// 1.计算状态的最新值
// 2.创造子fiberNode
function updateHostRoot(wip: FiberNode, renderLane: Lane) {
	const baseState = wip.memoizedState; // 首屏渲染是不存在的
	const updateQueue = wip.updateQueue as UpdateQueue<ReactElementType>;
	const pending = updateQueue.shared.pending;
	// 计算完 重置updateQueue.shared.pending
	updateQueue.shared.pending = null;
	const { memoizedState } = processUpdateQueue(baseState, pending, renderLane);
	// <App/>
	wip.memoizedState = memoizedState;
	// 子对应的reactElement
	const nextChildren = wip.memoizedState;
	// 子对应的current fiberNode  wip.alternate?.child即current?.child
	reconcileChildren(wip, nextChildren); // 返回子fiberNode
	return wip.child;
}

// hostComponent是无法触发更新的
// 1.创造子fiberNode
function updateHostComponent(wip: FiberNode) {
	// <div><span></span></div> <span></span>节点对应的ReactElement就是<div></div>的ReactElement的children，children在div的props里
	const nextProps = wip.pendingProps;
	const nextChildren = nextProps.children;
	reconcileChildren(wip, nextChildren);
	return wip.child;
}

// beginWork性能优化策略
// 考虑如下结构的reactElement：
// <div>
//  <p>练习时长</p>
//  <span>两年半</span>
// </div>
// 理论上mount流程完毕后包含的flags：
// 两年半 Placement
// span Placement
// 练习时长 Placement
// p Placement
// div Placement
// 相比于执行5次Placment，我们可以构建好「离屏DOM树」后，对div执行1次Placement操作
function reconcileChildren(wip: FiberNode, children?: ReactElementType) {
	// <A>
	//  <B/>
	// </A>
	// 当进入A的beginWork时，通过对比B current fiberNode与B reactElement，生成B对应wip fiberNode。
	// 先获取父节点的current
	const current = wip.alternate;
	if (current !== null) {
		// update
		// 对于首屏渲染，hostRootFiber既有workInProgress也有current，所以走update逻辑,被插入一个placement的标记，执行一次dom插入操作
		// 首屏渲染hostRootFiber，wip是有current的，所以走reconcileChildFibers方法
		wip.child = reconcileChildFibers(wip, current?.child, children);
	} else {
		// mount 不需要追踪副作用
		// 对于首屏渲染，hostRootFiber.child(APP) APP的挂载走这里
		wip.child = mountChildFibers(wip, null, children);
	}
}
