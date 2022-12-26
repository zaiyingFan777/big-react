// 实现mount时调用的api
// 对外暴露两个函数
// ReactDOM.createRoot(rootElement).render(<App/>)，createRoot内部执行createContainer，render内部执行updateContainer

import { Container } from 'hostConfig';
import { FiberNode, FiberRootNode } from './fiber';
import { HostRoot } from './workTags';
import {
	UpdateQueue,
	createUpdate,
	createUpdateQueue,
	enqueueUpdate
} from './updateQueue';
import { ReactElementType } from 'shared/ReactTypes';
import { scheduleUpdateOnFiber } from './workLoop';

// ReactDOM.createRoot(rootElement)
export function createContainer(container: Container) {
	const hostRootFiber = new FiberNode(HostRoot, {}, null);
	const root = new FiberRootNode(container, hostRootFiber);
	// 将更新机制接入hostRootFiber
	hostRootFiber.updateQueue = createUpdateQueue();
	// 返回fiberRootNode
	return root;
}

// render(<App/>)
export function updateContainer(
	element: ReactElementType | null,
	root: FiberRootNode
) {
	const hostRootFiber = root.current;
	// 首屏渲染触发更新
	const update = createUpdate<ReactElementType | null>(element);
	// 将更新插入到updateQueue
	enqueueUpdate(
		hostRootFiber.updateQueue as UpdateQueue<ReactElementType | null>,
		update
	);
	scheduleUpdateOnFiber(hostRootFiber);
	return element;
}