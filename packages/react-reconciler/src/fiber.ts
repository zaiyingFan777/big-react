/**
 * @desc: 存放fiberNode的文件
 */

import { Key, Props, ReactElementType, Ref } from 'shared/ReactTypes';
import { FunctionComponent, HostComponent, WorkTag } from './workTags';
import { Flags, NoFlags } from './fiberFlags';
import { Container } from 'hostConfig'; // tsconfig.json中配置了

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
	ref: Ref;

	return: FiberNode | null;
	sibling: FiberNode | null;
	child: FiberNode | null;
	index: number;

	memoizedProps: Props | null;
	memoizedState: any;
	// 如果当前的fiberNode是current那么他的alternate指向workInProgress fiberNode
	// 如果当前的fiberNode是workInProgress那么他的alternate指向current fiberNode
	alternate: FiberNode | null;
	// 标记
	flags: Flags;
	// 子树中是否有更新
	subtreeFlags: Flags;
	// 更新，比如mount的时候(首屏渲染)，hostRootFiber的updateQueue放的就是要渲染的所有组件
	updateQueue: unknown;

	/**
	 * pendingProps: 当前fiberNode有哪些props需要改变
	 */
	constructor(tag: WorkTag, pendingProps: Props, key: Key) {
		// 实例属性
		this.tag = tag;
		this.key = key;
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
	}
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

	constructor(container: Container, hostRootFiber: FiberNode) {
		this.container = container;
		this.current = hostRootFiber;
		hostRootFiber.stateNode = this;
		this.finishedWork = null;
	}
}

// 双缓存机制 找到current的alternate，作为内存中构建的树wip
// 根据当前的hostRootFiber生成wip的hsotRootFiber
export const createWorkInProgress = (
	current: FiberNode,
	pendingProps: Props
): FiberNode => {
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
	}
	wip.type = current.type;
	wip.updateQueue = current.updateQueue;
	wip.child = current.child;
	wip.memoizedProps = current.memoizedProps;
	wip.memoizedState = current.memoizedState;

	return wip;
};

// 根据ReactElement创建fiberNode
export function createFiberFromElement(element: ReactElementType) {
	const { type, key, props } = element; // ReactElement: 这里的props其实就是element的子element
	let fiberTag: WorkTag = FunctionComponent;

	if (typeof type === 'string') {
		// <div/> type: 'div'
		fiberTag = HostComponent;
	} else if (typeof type === 'function' && __DEV__) {
		console.warn('未定义的type类型', element);
	}
	const fiber = new FiberNode(fiberTag, props, key);
	fiber.type = type;
	return fiber;
}
