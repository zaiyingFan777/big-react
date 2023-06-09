// 递归中的递阶段

import { ReactElementType } from 'shared/ReactTypes';
import { FiberNode } from './fiber';
import { UpdateQueue, processUpdateQueue } from './updateQueue';
import {
	ContextProvider,
	Fragment,
	FunctionComponent,
	HostComponent,
	HostRoot,
	HostText
} from './workTags';
import { reconcileChildFibers, mountChildFibers } from './childFibers';
import { renderWithHooks } from './fiberHooks';
import { Lane } from './fiberLanes';
import { Ref } from './fiberFlags';
import { pushProvider } from './fiberContext';

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
		case ContextProvider:
			return updateContextProvider(wip);
		default:
			if (__DEV__) {
				console.warn('beginWork未实现的类型');
			}
			break;
	}
	return null;
};

// context.provider context入栈
function updateContextProvider(wip: FiberNode) {
	// todo自己的逻辑 context当前值的入栈（beginWork向下遍历是很好的入栈过程）与出栈（completeWork是向上遍历的过程）
	// wip.type
	// context.Provider = {
	// 	$$typeof: REACT_PROVIDER_TYPE,
	// 	_context: context
	// };
	const providerType = wip.type;
	const context = providerType._context;
	const oldProps = wip.memoizedProps;
	// <ctx.Provider value={0}>
	// 	<Child />
	// 	<ctx.Provider value={1}>
	// 		<Child />
	// 		<ctx.Provider value={2}>
	// 			<Child />
	// 		</ctx.Provider>
	// 	</ctx.Provider>
	// </ctx.Provider>
	// props代表了value={0}以及children
	const newProps = wip.pendingProps;
	const newValue = newProps.value;
	// <ctx.Provider>没有传value
	if (__DEV__ && !('value' in newProps)) {
		console.warn('<Context.Provider>需要传递value props');
	}
	if (newValue !== oldProps?.value) {
		// const ctx = createContext(null);
		// function App() {
		// 	const [num, update] = useState(0);
		// 	return (
		// 		<ctx.Provider value={num}>
		// 				<div onClick={() => update(Math.random())}>
		// 					<Middle />
		// 				</div>
		// 		</ctx.Provider>
		// 	);
		// }
		// class Middle extends Component {
		// 		shouldComponentUpdate() {
		// 				return false;
		// 		}
		// 		render() {
		// 				return <Child />;
		// 		}
		// }
		// function Child() {
		// 	const val = useContext(ctx);
		// 	return <p>{val}</p>;
		// }
		// TODO 应对上面面这种情况，Middle组件不需要更新Child组件也不需要（因为bailout存在的原因，所以middle（shouldComponentUpdate return false;）以及后面的组件都不更新，这属于优化策略），
		// 但是context变了，child组件又消费了context，所以需要像下面的描述那样去操作。ps：如果shouldComponentUpdate返回true，middle、chldren组件会一直走diff流程
		// context.value变化
		// 从Provider向下DFS，寻找消费了当前变化的context的consumer
		// 如果找到consumer，从consumer向上便遍历到Provider
		// 标记沿途组件存在更新
	}

	// context入栈过程
	pushProvider(context, newValue);
	const nextChildren = newProps.children; // pendingProps: {children: {$$typeof..}, value: 0} 这里我们去diff的是children
	reconcileChildren(wip, nextChildren);
	return wip.child;
}

// fragment组件
function updateFragment(wip: FiberNode) {
	const nextChildren = wip.pendingProps;
	reconcileChildren(wip, nextChildren);
	return wip.child;
}

// 函数组件
function updateFunctionComponent(wip: FiberNode, renderLane: Lane) {
	// 2023/6/5 关于编译
	// function App(flag) {return flag ? A组件 : B组件}
	// 比如这样的app函数组件，如果build就把a b的jsx都编译好了，无非就是运行时根据不同的flag来return对应的组件生成的已经在build编译好的jsx，并且将值代入生成jsx(xx,yy)
	// 这个jsx正是我们实现的jsx方法，然后执行jsx(xx,yy)，生成ReactElement, current fiber与ReactElement diff生成 wip fiber

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
	// 首屏渲染不会被打断，因此将updateQueue.shared.pending置空没问题
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
	// 标记ref
	markRef(wip.alternate, wip);
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
		// 2023/2/27
		// 如果是{falg?<div>111</div>:<div><button>button</button></div>}第一次渲染111第二次因为<button>button</button>没有current，所以
		// diff div 的时候走placeSingleChild(shouldTrackEffects为true,button的alternate为null)然后加上标记2。也是在completework的时候构建离屏dom(构建一个新的button dom)到commitRoot的时候直接插入构建好的div，
		// 同时div的父节点还有删除的节点[childDeletion]
		wip.child = reconcileChildFibers(wip, current?.child, children);
	} else {
		// mount 不需要追踪副作用
		// 对于首屏渲染，hostRootFiber.child(APP) APP的挂载走这里
		wip.child = mountChildFibers(wip, null, children);
	}
}

// 标记ref
function markRef(current: FiberNode | null, workInProgress: FiberNode) {
	const ref = workInProgress.ref;

	// mount时存在ref 或者 update时 ref引用变化
	if (
		(current === null && ref !== null) ||
		(current !== null && current.ref !== ref)
	) {
		workInProgress.flags |= Ref;
	}
}
