// 存放FiberNode的文件
import { Props, Key, Ref, ReactElementType } from 'shared/ReactTypes';
import {
	ContextProvider,
	Fragment,
	FunctionComponent,
	HostComponent,
	WorkTag
} from './workTags';
import { Flags, NoFlags } from './fiberFlags';
import { Container } from 'hostConfig';
import { Lane, Lanes, NoLane, NoLanes } from './fiberLanes';
import { Effect } from './fiberHooks';
import { CallbackNode } from 'scheduler';
import { REACT_PROVIDER_TYPE } from 'shared/ReactSymbols';

// reconciler的工作方式
// 对于同一个节点，比较其ReactElement与fiberNode，生成子fiberNode。并根据比较的结果生成不同标记（插入、删除、移动......），对应不同宿主环境API的执行。

// mount阶段的起点，createContainer中会把根组件<app>对应reactElement元素传入给rootFIber的updateQueue，作为beginwork任务的起点
// memoizedState 对于不同类型的fiber意义不一样
// 对于hostRootFiber 它就是根组件对应的reactElement，hostRoot将updateQueue里的reactElement计算完毕后赋值给memoizedState
// 对于函数组件memoizedState就是他的hook的单向链表，函数组件的updateQueue就是他的useEffect的环状链表
// 对于函数组件hook的memoizedState也能保存startTransition函数
// 对于hostComponent组件memoizedState保存有他的ref

// updateQueue：函数组件的updateQueue就是他的useEffect的环状链表
// hostComponent的updateQueue是他的更新的属性比如[className, 'aaa', title, 'hahaha']，属性的更新是在completeWork中完成的
// hostRootFiber的updateQueue里的reactElement

// pendingProps memoizedProps，计算完毕将pendingProps赋值给memoizedProps，比如hostComponent就是他的{children: xxx}或者onClick等
// 对于function组件就是我们传递的props,里面也可能有children或者其他我们传递的props
export class FiberNode {
	tag: WorkTag;
	pendingProps: Props;
	key: Key;
	stateNode: any;
	type: any;
	ref: Ref;

	return: FiberNode | null;
	sibling: FiberNode | null;
	child: FiberNode | null;
	index: number;

	memoizedProps: Props | null;
	// 保存hooks的数据：指向hooks(useState、useEffect)的单向链表的第0个hooks，hooks连接通过next字段
	// 因此调用的hooks的顺序不能变
	memoizedState: any;
	updateQueue: unknown;

	alternate: FiberNode | null;

	// 副作用
	flags: Flags;
	subtreeFlags: Flags; // 子树中的状态
	deletions: FiberNode[] | null;

	// key ReactElement key
	// pendingProps fibernode接下来有哪些prop需要改变
	constructor(tag: WorkTag, pendingProps: Props, key: Key) {
		// FiberNode实例属性
		this.tag = tag;
		this.key = key || null; // key默认值为null
		// 对于HostComponent <div></div> 而言。stateNode就是保存的div的Dom
		this.stateNode = null;
		// 类型，FunctionComponent tag为0，这个type就是() => {}函数本身
		this.type = null;

		// 构成树状结构
		// 节点之间的关系
		// 指向父FiberNode
		this.return = null;
		// 指向右边FiberNode
		this.sibling = null;
		// 指向第一个子FiberNode
		this.child = null;
		// <ul>li * 3</ul> 第一个li的index为0，第二个为1，第三个为2
		this.index = 0;

		this.ref = null;

		// 作为工作单元
		this.pendingProps = pendingProps; // 工作单元刚开始工作的时候的props是什么
		this.memoizedProps = null; // 工作单元结束工作完后确定的props是什么
		this.updateQueue = null;
		this.memoizedState = null;

		// 如果当前的为current，alternate代表的是workInProgress，如果为workInProgress，alternate为current
		this.alternate = null;

		// 统称为副作用，标记：删除、插入
		this.flags = NoFlags;
		this.subtreeFlags = NoFlags;
		this.deletions = null;
	}
}

export interface PendingPassiveEffects {
	unmount: Effect[];
	update: Effect[];
}

// 当前应用统一的根节点fiberRootNode
// 需要参数，ReactDOM.createRoot(rootElement).render(或者老版本的ReactDOM.render) rootElement就是container参数
// fiberRootNode.current = hostRootFiber，hostRootFiber.stateNode = fiberRootNode;
// hostRootFiber.child = App，App.return = hostRootFiber;
export class FiberRootNode {
	container: Container; // 有可能是domElement或者其他宿主环境的元素
	current: FiberNode;
	finishedWork: FiberNode | null; // 指向了整个更新完成之后的hostRootFiber
	pendingLanes: Lanes; // 所有未被消费的lane的集合
	finishedLane: Lane; // 代表本次更新消费的lane
	pendingPassiveEffects: PendingPassiveEffects; // 收集1.unmount时执行的destory回调2.update时执行的create回调
	// 保存回调函数，同一work继续调度此回调函数
	callbackNode: CallbackNode | null;
	callbackPriority: Lane;

	constructor(container: Container, hostRootFiber: FiberNode) {
		this.container = container;
		this.current = hostRootFiber;
		hostRootFiber.stateNode = this;
		this.finishedWork = null;
		this.pendingLanes = NoLanes;
		this.finishedLane = NoLane;

		this.callbackNode = null;
		this.callbackPriority = NoLane;

		this.pendingPassiveEffects = {
			unmount: [],
			update: []
		};
	}
}

// 将fiberRootNode变为fiberNode
export const createWorkInProgress = (
	current: FiberNode,
	pendingProps: Props
): FiberNode => {
	// 双缓存机制，我每次都获取跟我对应的另一个fiberNode
	let wip = current.alternate;

	if (wip === null) {
		// 首屏渲染 mount
		wip = new FiberNode(current.tag, pendingProps, current.key);
		wip.stateNode = current.stateNode;

		wip.alternate = current;
		current.alternate = wip;
	} else {
		// update
		wip.pendingProps = pendingProps;
		// 清除掉副作用
		wip.flags = NoFlags;
		wip.subtreeFlags = NoFlags;
		wip.deletions = null;
	}
	wip.type = current.type;
	wip.updateQueue = current.updateQueue;
	wip.child = current.child;
	wip.memoizedProps = current.memoizedProps;
	wip.memoizedState = current.memoizedState;
	wip.ref = current.ref;

	return wip;
};

export function createFiberFromElement(element: ReactElementType): FiberNode {
	const { type, key, props, ref } = element;
	let fiberTag: WorkTag = FunctionComponent;

	if (typeof type === 'string') {
		// dom: <div></div> ReactElementType type: 'div'
		// 函数组件jsx的type是函数本身
		fiberTag = HostComponent;
	} else if (
		typeof type === 'object' &&
		type.$$typeof === REACT_PROVIDER_TYPE
	) {
		// provider
		fiberTag = ContextProvider;
	} else if (typeof type !== 'function' && __DEV__) {
		console.warn('未定义的type类型', element);
	}
	const fiber = new FiberNode(fiberTag, props, key);
	fiber.type = type;
	fiber.ref = ref;
	return fiber;
}

export function createFiberFromFragment(elements: any[], key: Key): FiberNode {
	const fiber = new FiberNode(Fragment, elements, key);
	return fiber;
}
