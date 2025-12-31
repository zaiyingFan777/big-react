import { Props, Key, Ref, ReactElementType } from 'shared/ReactTypes';
import {
	Fragment,
	FunctionComponent,
	HostComponent,
	WorkTag
} from './workTags';
import { Flags, NoFlags } from './fiberFlags';
import { Container } from 'hostConfig';
import { Lane, Lanes, NoLane, NoLanes } from './fiberLanes';
import { Effect } from './fiberHooks';

export class FiberNode {
	type: any;
	tag: WorkTag;
	pendingProps: Props;
	key: Key;
	stateNode: any;
	ref: Ref;

	return: FiberNode | null;
	sibling: FiberNode | null;
	child: FiberNode | null;
	index: number;

	memoizedProps: Props | null;
	memoizedState: any;
	alternate: FiberNode | null;
	flags: Flags;
	subtreeFlags: Flags;
	updateQueue: unknown;
	deletions: FiberNode[] | null;

	constructor(tag: WorkTag, pendingProps: Props, key: Key) {
		// 实例属性
		this.tag = tag;
		this.key = key || null;
		// HostComponent <div> div对应的DOM
		this.stateNode = null;
		// tag: 0
		// FunctionComponent: () => {}
		this.type = null;

		// 构成树状结构
		// 指向父FiberNode
		this.return = null;
		// 右边的兄弟FiberNode
		this.sibling = null;
		// 第一个子FiberNode
		this.child = null;
		// <ul> li * 3 </ul>
		// 第一个li的index为0
		this.index = 0;

		this.ref = null;

		// 作为工作单元
		// 此工作单元刚开始工作的时候的props
		this.pendingProps = pendingProps;
		// 此工作单元工作结束的时候的props
		this.memoizedProps = null;
		// 此工作单元工作结束的时候的state
		// ! function comp中 memoizedState指向fc中第0个hook(hooks[0].next -> useEffect..)，这里的hooks是个
		// ! 链表，因此定义的hook顺序不能变，他是一条链表保存的
		this.memoizedState = null;
		this.updateQueue = null;

		// 如果此时fiberNode为current,则alternate指向workInProgress。
		// 如果此时fiberNode为workInProgress,则alternate指向current。
		this.alternate = null;
		// 副作用
		this.flags = NoFlags;
		// 子树中包含的副作用
		this.subtreeFlags = NoFlags;
		// 父节点的数组结构，保存了父节点下需要被删除的子节点
		this.deletions = null;
	}
}

export interface PendingPassiveEffects {
	unmount: Effect[];
	update: Effect[];
}

export class FiberRootNode {
	// 保存宿主环境挂载的节点，比如ReactDOM.createRoot(rootElement)中的rootElement
	container: Container;
	// current指向hostRootFiber
	current: FiberNode;
	// 指向 本次更新完成后的hostRootFiber
	finishedWork: FiberNode | null;
	// 所有未更新的lane的集合
	pendingLanes: Lanes;
	// 本次更新选出来的lane
	finishedLane: Lane;
	// 存放本次更新的需要执行的effect的副作用
	pendingPassiveEffects: PendingPassiveEffects;
	constructor(container: Container, hostRootFiber: FiberNode) {
		this.container = container;
		this.current = hostRootFiber;
		// hostRootFiber.stateNode指向fiberRootNode
		hostRootFiber.stateNode = this;
		this.finishedWork = null;
		this.pendingLanes = NoLanes;
		this.finishedLane = NoLane;
		this.pendingPassiveEffects = {
			unmount: [],
			update: []
		};
	}
}

// 创建workInProgress【记录Update开始后的fiber节点】
// 传入current，返回alternate 【双缓存技术】
export const createWorkInProgress = (
	current: FiberNode,
	pendingProps: Props
): FiberNode => {
	let wip = current.alternate;

	if (wip === null) {
		// mount
		wip = new FiberNode(current.tag, pendingProps, current.key);
		// 指向fiberRootNode
		wip.stateNode = current.stateNode;

		// 相互绑定
		wip.alternate = current;
		current.alternate = wip;
	} else {
		// update
		wip.pendingProps = pendingProps;
		// 清空副作用，可能是上次更新遗留下来的
		wip.flags = NoFlags;
		wip.subtreeFlags = NoFlags;
		wip.deletions = null;
	}
	wip.type = current.type;
	// shared.pending数据结构方便wip和current共用这一数据结构
	wip.updateQueue = current.updateQueue;
	wip.child = current.child;
	wip.memoizedProps = current.memoizedProps;
	wip.memoizedState = current.memoizedState;

	return wip;
};

export function createFiberFromElement(element: ReactElementType): FiberNode {
	const { type, key, props } = element;
	let fiberTag: WorkTag = FunctionComponent;

	if (typeof type === 'string') {
		// <div/> type: 'div'
		fiberTag = HostComponent;
	} else if (typeof type !== 'function' && __DEV__) {
		console.warn('为定义的type类型', element);
	}
	const fiber = new FiberNode(fiberTag, props, key);
	fiber.type = type;
	return fiber;
}

// 创建Fragment fiber
export function createFiberFromFragment(elements: any[], key: Key): FiberNode {
	const fiber = new FiberNode(Fragment, elements, key);
	return fiber;
}
