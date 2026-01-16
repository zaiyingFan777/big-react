import { Props, Key, Ref, ReactElementType, Wakeable } from 'shared/ReactTypes';
import {
	ContextProvider,
	Fragment,
	FunctionComponent,
	HostComponent,
	MemoComponent,
	OffscreenComponent,
	SuspenseComponent,
	WorkTag
} from './workTags';
import { Flags, NoFlags } from './fiberFlags';
import { Container } from 'hostConfig';
import { Lane, Lanes, NoLane, NoLanes } from './fiberLanes';
import { Effect } from './fiberHooks';
import { CallbackNode } from 'scheduler';
import {
	REACT_MEMO_TYPE,
	REACT_PROVIDER_TYPE,
	REACT_SUSPENSE_TYPE
} from 'shared/ReactSymbols';
import { ContextItem } from './fiberContext';

// fiber.denpendencies保存函数组件依赖的context
interface FiberDependencies<Value> {
	firstContext: ContextItem<Value> | null;
	lanes: Lanes; // 某个更新导致context.value发生变化，那么把本次更新添加到依赖中
}

export class FiberNode {
	type: any;
	tag: WorkTag;
	pendingProps: Props;
	key: Key;
	stateNode: any;
	ref: Ref | null;

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

	lanes: Lanes;
	childLanes: Lanes;

	dependencies: FiberDependencies<any> | null;

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

		// * bailout
		// 所有未执行更新对应的Lane
		this.lanes = NoLanes;
		// 保存一个fiberNode子树中「所有未执行更新对应的lane」
		this.childLanes = NoLanes;

		this.dependencies = null;
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

	// *
	// 代表了当前root下所有被挂起的lane(更新)
	// update造成了挂起，那么这次的lane就进入了suspendedLanes
	suspendedLanes: Lanes;
	// wakeable醒了，那么就把此次的lane保存在pingedLanes
	// pingedLanes中的lane都是suspendedLanes的子集
	pingedLanes: Lanes;

	// 本次更新选出来的lane
	finishedLane: Lane;
	// 存放本次更新的需要执行的effect的副作用
	pendingPassiveEffects: PendingPassiveEffects;
	// 当前调度的回调函数
	callbackNode: CallbackNode | null;
	// 当前调度的优先级
	callbackPriority: Lane;

	// WeakMap{ wakeable: Set[lane1, lane2, ...]}
	pingCache: WeakMap<Wakeable<any>, Set<Lane>> | null;

	constructor(container: Container, hostRootFiber: FiberNode) {
		this.container = container;
		this.current = hostRootFiber;
		// hostRootFiber.stateNode指向fiberRootNode
		hostRootFiber.stateNode = this;
		this.finishedWork = null;
		this.pendingLanes = NoLanes;
		this.finishedLane = NoLane;

		this.suspendedLanes = NoLanes;
		this.pingedLanes = NoLanes;

		this.callbackNode = null;
		this.callbackPriority = NoLane;

		this.pendingPassiveEffects = {
			unmount: [],
			update: []
		};

		this.pingCache = null;
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

	wip.ref = current.ref;

	wip.lanes = current.lanes;
	wip.childLanes = current.childLanes;

	// 拷贝fiber的依赖项
	const currentDeps = current.dependencies;
	wip.dependencies =
		currentDeps === null
			? null
			: {
					lanes: currentDeps.lanes,
					firstContext: currentDeps.firstContext
			  };

	return wip;
};

export function createFiberFromElement(element: ReactElementType): FiberNode {
	const { type, key, props, ref } = element;
	let fiberTag: WorkTag = FunctionComponent;

	if (typeof type === 'string') {
		// <div/> type: 'div'
		fiberTag = HostComponent;
	} else if (typeof type === 'object') {
		switch (type.$$typeof) {
			case REACT_PROVIDER_TYPE:
				fiberTag = ContextProvider;
				break;
			case REACT_MEMO_TYPE:
				fiberTag = MemoComponent;
				break;
			default:
				console.warn('未定义的type类型', element);
				break;
		}
	} else if (type === REACT_SUSPENSE_TYPE) {
		fiberTag = SuspenseComponent;
	} else if (typeof type !== 'function' && __DEV__) {
		console.warn('为定义的type类型', element);
	}
	const fiber = new FiberNode(fiberTag, props, key);
	fiber.type = type;
	fiber.ref = ref;
	return fiber;
}

// 创建Fragment fiber
export function createFiberFromFragment(elements: any[], key: Key): FiberNode {
	const fiber = new FiberNode(Fragment, elements, key);
	return fiber;
}

export interface OffscreenProps {
	mode: 'visible' | 'hidden';
	children: any;
}

export function createFiberFromOffscreen(pendingProps: OffscreenProps) {
	const fiber = new FiberNode(OffscreenComponent, pendingProps, null);
	// TODO stateNode
	return fiber;
}
