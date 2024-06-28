import { Container } from 'hostConfig';
import { FiberNode, FiberRootNode } from './fiber';
import { HostRoot } from './workTags';
import {
	createUpdate,
	createUpdateQueue,
	enqueueUpdate,
	UpdateQueue
} from './updateQueue';
import { ReactElementType } from 'shared/ReactTypes';
import { scheduleUpdateOnFiber } from './workLoop';
import { requestUpdateLane } from './fiberLanes';
import {
	unstable_ImmediatePriority,
	unstable_runWithPriority
} from 'scheduler';

/**
 *
 * @desc: createContainer和updateContainer两个函数主要实现：
 *        1.实现mount时调用的API
 *        2.将该API接入到更新机制中
 */

// ReactDOM.createRoot(rootElement).render(<App/>)中ReactDOM.createRoot()调用的时候，内部调用此函数
export function createContainer(container: Container) {
	// 初始化的时候我们会有fiberRootNode以及hostRootFiber，当第一次mount的时候根据这个hostRootFiber创建wip
	// 初始化hostRootFiber
	const hostRootFiber = new FiberNode(HostRoot, {}, null);
	// 初始化fiberRootNode
	const root = new FiberRootNode(container, hostRootFiber);
	// 接入初始化时候的更新机制
	hostRootFiber.updateQueue = createUpdateQueue();
	return root;
}

// render(<App/>)的时候调用此函数
// element就是<App/>对应的ReactElement
export function updateContainer(
	element: ReactElementType | null,
	root: FiberRootNode
) {
	// 默认为同步更新，使用并发特性后的那次更新才启用并发更新，因此mount时更新的优先级为同步更新优先级。
	unstable_runWithPriority(unstable_ImmediatePriority, () => {
		// 获取hostRootFiber
		const hostRootFiber = root.current;
		// 取出当前触发条件下的lane(同步优先级)
		const lane = requestUpdateLane();
		// 首屏渲染触发更新
		const update = createUpdate<ReactElementType | null>(element, lane);
		// 将update插入hostRootFiber的updateQueue中
		enqueueUpdate(
			hostRootFiber.updateQueue as UpdateQueue<ReactElementType | null>,
			update
		);
		scheduleUpdateOnFiber(hostRootFiber, lane);
	});

	return element;
}
