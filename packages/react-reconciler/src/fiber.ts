/**
 * @desc: 存放fiberNode的文件
 */

import { Key, Props, ReactElementType, Ref, Wakeable } from 'shared/ReactTypes';
import {
	FunctionComponent,
	HostComponent,
	WorkTag,
	Fragment,
	ContextProvider,
	SuspenseComponent,
	OffscreenComponent,
	MemoComponent
} from './workTags';
import { Flags, NoFlags } from './fiberFlags';
import { Container } from 'hostConfig'; // tsconfig.json中配置了
import { Lane, Lanes, NoLane, NoLanes } from './fiberLanes';
import { Effect } from './fiberHooks';
import { CallbackNode } from 'scheduler';
import {
	REACT_MEMO_TYPE,
	REACT_PROVIDER_TYPE,
	REACT_SUSPENSE_TYPE
} from 'shared/ReactSymbols';

export interface OffscreenProps {
	mode: 'visible' | 'hidden';
	children: any;
}

// jsx 经过babel编译为 jsx() React.createElement()，之后调用jsx()或React.createElement()[这里面是我们实现的jsx]会生成 ReactElement
// ReactElement => FiberNode => DOM
// 因为依赖于shared记得在react-reconciler中的package加上依赖，并pnpm i
// babel编译
// function App() {
//   return <Child/>;
// }

// function Child() {
//   return <div>123</div>;
// }

// =>
// function App() {
//   return /*#__PURE__*/React.createElement(Child, null);
// }
// function Child() {
//   return /*#__PURE__*/React.createElement("div", null, "123");
// }

// => 调用jsx()得到ReactElement
// {
//   $$typeof: Symbol(react.element),
//   key: null,
//   props: {},
//   ref: null,
//   type: Child(Child函数本身)
// }

// reconciler的工作方式
// 对于同一个节点，比较其ReactElement与fiberNode，生成子fiberNode。
// 并根据比较的结果生成不同标记（插入、删除、移动......），对应不同宿主环境API的执行。

// jsx消费顺序：dfs遍历ReactElement，这意味着
// 1.如果有子节点，遍历子节点
// 2.如果没有子节点，遍历兄弟节点
// 如果一个组件要被卸载，那么他的子孙节点的componentWillUnmount执行顺序应该是，孙、子、当前组件（递归的过程）。

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
	// 函数组件：memoizedState指向的hooks链表（useState->useEffect->useState）因此hook的调用顺序不能变化!!!
	// HostRootFiber: mount时，memoizedState指向的是整个节点的ReactElement
	memoizedState: any;
	// 如果当前的fiberNode是current那么他的alternate指向workInProgress fiberNode
	// 如果当前的fiberNode是workInProgress那么他的alternate指向current fiberNode
	alternate: FiberNode | null;
	// 标记
	flags: Flags;
	// 子树中是否有更新
	subtreeFlags: Flags;
	// 1.更新，比如mount的时候(首屏渲染)，hostRootFiber的updateQueue放的就是要渲染的所有组件
	// 2.HostComponent组件更新属性变化 将变化的属性存放在updateQueue中 : [n, n+1] 第n项为变化的属性，第n+1项为变化的属性值，比如[className, 'aaa', title, 'hahah']
	// n为key n+1为value
	// 3.对于fc组件，updateQueue中lastEffect存储的是effect hooks的环形链表的最后一个(updateQueue属性中有1.shared.pending 2.dispatch 3.lastEffect(指向fc组件中最后一个effect))
	updateQueue: unknown;
	deletions: FiberNode[] | null;

	// 保存fiberNode中所有未执行更新对应的lane
	// 跟root.pendingLanes什么区别呢？root.pendingLanes代表整个组件树下的所有fiber中存在的update对应的Lane的合集
	// fiber.lanes代表了某一个fiebr的未执行的update对应的lane的合集
	lanes: Lanes;
	// 类比subtreeFlags，保存一个fiberNode子树中所有未执行更新对应的lane
	childLanes: Lanes;

	/**
	 * pendingProps: 当前fiberNode有哪些props需要改变
	 */
	constructor(tag: WorkTag, pendingProps: Props, key: Key) {
		// 实例属性
		this.tag = tag;
		this.key = key || null;
		// HostComponent <div> div DOM
		this.stateNode = null;
		// FunctionComponent tag: 0 type: () => {}
		// HostComponent     tag: 5 type: 'div'
		this.type = null;

		// 构成树状结构
		// 指向父fiberNode
		this.return = null;
		// 指向右边的兄弟fiberNode
		this.sibling = null;
		// 指向子fiberNode
		this.child = null;
		// <ul>li * 3</ul> 第一个li index为0 第二个li index为1 第三个li index为2
		this.index = 0;

		this.ref = null;

		// 作为工作单元
		// 工作单元刚开始准备工作的时候的props
		this.pendingProps = pendingProps;
		// 工作单元工作完成后的props，确定下来的props
		this.memoizedProps = null;
		this.memoizedState = null;
		this.updateQueue = null;

		this.alternate = null;
		// 副作用
		this.flags = NoFlags;
		this.subtreeFlags = NoFlags;
		this.deletions = null;

		this.lanes = NoLanes;
		this.childLanes = NoLanes;
	}
}

export interface PendingPassiveEffects {
	unmount: Effect[];
	update: Effect[];
}

/**
 * 更新可能发生于任意组件，而更新流程是从根节点递归的
 * 需要一个统一的根节点保存通用信息
 * ReactDOM.createRoot(rootElement).render(<App/>)中ReactDOM.createRoot方法调用生成统一的根节点FiberRootNode
 * rootElement对应的DOM比如#root(hostRootFiber)，App就是起始根组件
 *           fiberRootNode
 *    (current)↓       ↑(stateNode)
 *            hostRootFiber
 *      (child)↓      ↑(return)
 *               App（fiberNode）
 */
export class FiberRootNode {
	container: Container; // 对于浏览器是DOMElement，其他环境是其他环境的节点
	current: FiberNode; // hostRootFiber
	finishedWork: FiberNode | null; // 我们整个更新完成以后的hostRootFiber，也就是当前更新完成递归流程的hsotRootFiber
	pendingLanes: Lanes; // 所有未被消费的lane的集合
	finishedLane: Lane; // 本次更新schedule选择出来要被消费的lane
	pendingPassiveEffects: PendingPassiveEffects; // 收集的effect副作用的回调

	// 当前正在被调度的任务
	callbackNode: CallbackNode | null;
	// 当前正在被调度的优先级
	callbackPriority: Lane;

	// WeakMap{promise: Set<Lane>}
	// 键必须是对象：WeakMap 的键必须是对象，不能是原始类型（如字符串或数字）
	// 弱引用：WeakMap 中的键是弱引用，这意味着如果一个键的对象没有被其他引用所引用，那么这个对象可以被垃圾回收器回收。这有助于防止内存泄漏。
	// 不可迭代：与 Map 不同，WeakMap 不可迭代，这意味着你不能使用 for...of 循环或其他迭代器方法来遍历 WeakMap。
	// 没有 size 属性：WeakMap 没有 size 属性，因为它的键是弱引用，所以它的大小可能会随时改变。
	pingCache: WeakMap<Wakeable<any>, Set<Lane>> | null;

	// 一次update造成了挂起（suspened的lane），那么把这个lane加入到suspendedLane中
	// 过了一段时间wakeable 执行了ping，那么把ping的lane保存在pingdLanes，因此pingdlanes是suspenedlane的子集
	// 代表当前root下所有被挂起的更新的集合
	suspendedLanes: Lanes;
	// 当前被挂起的更新里面被Ping的更新
	pingdLanes: Lanes;

	constructor(container: Container, hostRootFiber: FiberNode) {
		this.container = container;
		this.current = hostRootFiber;
		hostRootFiber.stateNode = this;
		this.finishedWork = null;
		this.pendingLanes = NoLanes;
		// =========
		// 挂起的Lane
		this.suspendedLanes = NoLanes;
		this.pingdLanes = NoLanes;
		// =========
		this.finishedLane = NoLane;

		this.callbackNode = null;
		this.callbackPriority = NoLane;

		this.pendingPassiveEffects = {
			unmount: [],
			update: []
		};

		this.pingCache = null;
	}
}

// 双缓存机制 找到current的alternate，作为内存中构建的树wip
// 根据当前的hostRootFiber生成wip的hsotRootFiber
export const createWorkInProgress = (
	current: FiberNode,
	pendingProps: Props
): FiberNode => {
	// 反复引用同一个对象
	let wip = current.alternate;

	if (wip === null) {
		// 首屏渲染 wip为null
		// mount
		// 创建一个fiberNode
		wip = new FiberNode(current.tag, pendingProps, current.key);
		wip.stateNode = current.stateNode;
		// 相互关联
		wip.alternate = current;
		current.alternate = wip;
	} else {
		// update
		wip.pendingProps = pendingProps;
		// 清空上次流程的副作用
		wip.flags = NoFlags;
		wip.subtreeFlags = NoFlags;
		wip.deletions = null;
	}
	wip.type = current.type;
	// 这里current和wip指向同一个对象，如果wip.updateQueue.shared.pending = null，那么他俩的updateQueue的shared.pending都为Null
	// 如果在wip.updateQueue.shared.pending = null之前，保存pending = wip.updateQueue.shared.pending; 那么pending还是指向{action: reactElement}
	wip.updateQueue = current.updateQueue;
	wip.child = current.child;
	wip.memoizedProps = current.memoizedProps;
	wip.memoizedState = current.memoizedState;
	wip.ref = current.ref;

	wip.lanes = current.lanes;
	wip.childLanes = current.childLanes;

	return wip;
};

// 根据ReactElement创建fiberNode
export function createFiberFromElement(element: ReactElementType) {
	const { type, key, props, ref } = element; // ReactElement: 这里的props其实就是element的子element
	let fiberTag: WorkTag = FunctionComponent;

	if (typeof type === 'string') {
		// <div/> type: 'div'
		fiberTag = HostComponent;
	} else if (typeof type === 'object') {
		switch (type.$$typeof) {
			case REACT_PROVIDER_TYPE:
				// ctx.provider
				fiberTag = ContextProvider;
				break;
			case REACT_MEMO_TYPE:
				// memo
				fiberTag = MemoComponent;
				break;
			default:
				console.warn('未定义的type类型', element);
				break;
		}
	} else if (type === REACT_SUSPENSE_TYPE) {
		fiberTag = SuspenseComponent;
	} else if (typeof type === 'function' && __DEV__) {
		fiberTag = FunctionComponent;
		// console.warn('未定义的type类型', element);
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

// 创建suspense中的offscreen的fiber
export function createFiberFromOffscreen(
	pendingProps: OffscreenProps
): FiberNode {
	const fiber = new FiberNode(OffscreenComponent, pendingProps, null);
	return fiber;
}
