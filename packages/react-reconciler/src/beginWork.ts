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
import {
	createFiberFromFragment,
	createFiberFromOffscreen,
	createWorkInProgress,
	FiberNode,
	OffscreenProps
} from './fiber';
import { processUpdateQueue, UpdateQueue } from './updateQueue';
import {
	ContextProvider,
	Fragment,
	FunctionComponent,
	HostComponent,
	HostRoot,
	HostText,
	MemoComponent,
	OffscreenComponent,
	SuspenseComponent
} from './workTags';
import {
	cloneChildFibers,
	mountChildFibers,
	reconcileChildFibers
} from './childFibers';
import { bailoutHook, renderWithHooks } from './fiberHooks';
import { includeSomeLanes, Lane, NoLanes } from './fiberLanes';
import {
	ChildDeletion,
	DidCapture,
	NoFlags,
	Placement,
	Ref
} from './fiberFlags';
import { pushProvider } from './fiberContext';
import { pushSuspenseHandler } from './suspenseContext';
import { shallowEqual } from 'shared/shallowEquals';

// 是否能命中bailout，默认能命中  false为能命中、true为不能命中
let didReceiveUpdate = false;

export function markWipReceiveUpdate() {
	// 接受到更新就是不能命中bailout策略
	didReceiveUpdate = true;
}

// 递归中的递阶段，renderLane本次更新的lane
export const beginWork = (wip: FiberNode, renderLane: Lane) => {
	// 每次开始都重置状态
	didReceiveUpdate = false;

	// bailout策略
	// if (满足四要素) {
	// 	return 复用的结果(bailout);
	// }
	// !!!如果没有命中四要素。也可能会命中bailout，state可能经过更新没有变化，如note.md的示例3
	// fiber.updateQueue.pending 里面保存了组件状态的更新链表(环状) update->update 但是这样比较繁琐
	// 因此我们给fiber新增fiber.lanes字段，这个字段保存了一个fiberNode[所有未执行更新对应的lane]
	// 我们只需要查找fiber.lanes是不是NoLane就知道这个fiber是否存在未执行的更新

	// 取到current
	const current = wip.alternate;

	if (current !== null) {
		const oldProps = current.memoizedProps;
		const newProps = wip.pendingProps;

		// 四要素之 props type比较
		// {num: 0, name: 'cpn2'}
		// {num: 0, name: 'cpn2'} 这个对象跟上面的对象表面一样但是引用的不是一个对象，因此不能===(全等)，但是浅比较是可以的???
		// 笼统的讲只要上一轮触发bailout 那本次更新props全等(因为这次props通过克隆出来上次的props，就没有产生新的props对象)，否则就得依靠 Memo
		// 从hostroot节点开始bailout 然后子节点就有机会进去bailout了
		// 这个函数组件的父亲节点如果命中了bailout那么函数组件作为子节点是被克隆出来的那么他的props引用的对象应该还是之前的
		// 所以子树命中性能优化的关键在于子树的根节点命中性能优化
		// 父组件命中bailout后，子组件是被复用的，因此oldProps === newProps，如果比如函数组件没有被复用，那么他会重新生成jsx->reactElement(新的RE会有新的props，然后赋值给wip.pendingProps)
		// 比如：jsx->RE，没有命中bailout会导致函数执行重新生成新的RE，props都是全新的对象{title: "123",children: "111"}
		// function App(){
		// 	return <div title="123">111</div>
		// }
		// import { jsx as _jsx } from "react/jsx-runtime";
		// function App() {
		// 	return /*#__PURE__*/_jsx("div", {
		// 		title: "123",
		// 		children: "111"
		// 	});
		// }
		if (oldProps !== newProps || current.type !== wip.type) {
			// 不能命中
			didReceiveUpdate = true;
		} else {
			// 比较state、context
			// 判断fiber中未执行的更新包含本次的更新吗
			const hasScheduledStateOrContext = checkScheduledUpdateOrContext(
				current,
				renderLane
			);
			if (!hasScheduledStateOrContext) {
				// 四要素中的state、context不变
				// 命中bailout
				didReceiveUpdate = false;

				switch (wip.tag) {
					case ContextProvider:
						// 因为context没变，那么我们只需要那之前的value来更新就可以了
						const newValue = wip.memoizedProps.value;
						const context = wip.type._context;
						pushProvider(context, newValue);
						break;

					// todo suspense
				}

				// 如果wip满足了bailout以及子树也满足 那么return null Wip以及子树都不会被render，
				// 如果只是wip满足，那么我们返回克隆的wip.child继续render
				return bailouOnAlreadyFinishedWork(wip, renderLane);
			}
		}
	}

	// 重置更新，因为在后续的计算状态中会把跳过的更新再加到wip.lanes中
	wip.lanes = NoLanes;

	// 比较，返回子fiberNode
	switch (wip.tag) {
		case HostRoot:
			// HostRoot的beginWork工作流程
			// 1.计算状态的最新值
			// 2.创造子fiberNode
			return updateHostRoot(wip, renderLane);
		case HostComponent:
			// HostComponent的beginWork工作流程
			// 1.创造子fiberNode
			return updateHostComponent(wip);
		case HostText:
			// HostText没有beginWork工作流程（因为他没有子节点）
			// <p>唱跳Rap</p>
			return null; // 递阶段完事，开始归阶段
		case FunctionComponent:
			return updateFunctionComponent(wip, wip.type, renderLane); // 递阶段完事，开始归阶段
		case Fragment:
			return updateFragment(wip);
		case ContextProvider:
			return updateContextProvider(wip);
		case SuspenseComponent:
			// beginwork SuspenseComponent return offscreen或者return fragment(fallback) 进入归阶段也是从offscreen或者fallback归到suspense
			return updateSuspenseComponent(wip);
		case OffscreenComponent:
			return updateOffscreenComponent(wip);
		case MemoComponent:
			return updateMemoComponent(wip, renderLane);
		default:
			if (__DEV__) {
				console.warn('beginWork未实现的类型', wip.tag);
			}
			break;
	}
	return null;
};

// Memo的beginwork
function updateMemoComponent(
	wip: FiberNode,
	renderLane: Lane
): FiberNode | null {
	// bailout四要素
	// props浅比较
	const current = wip.alternate;
	const nextProps = wip.pendingProps;
	// memo包裹的函数组件(见react包下的memo.ts)
	const Component = wip.type.type;

	if (current !== null) {
		// 获取current的props
		const prevProps = current.memoizedProps;
		// 浅比较props
		if (shallowEqual(prevProps, nextProps) && current.ref === wip.ref) {
			// 浅比较相等，并且ref前后也没有变，不需要更新
			didReceiveUpdate = false;
			// 将之前的props赋值给wip的pendingProps，没变化
			wip.pendingProps = prevProps;
			// 比较state context
			if (!checkScheduledUpdateOrContext(current, renderLane)) {
				// 满足四要素
				// checkScheduledUpdateOrContext返回false，那么就是检查current.lanes是否跟renderlane有交集
				// 如果本次更新跟current.lanes(fiber中还未进行的更新)没有交集，那就说明current在本次更新中没有要更新的，那就可以复用
				// 然后将current.lanes赋值给wip.lanes(因为beginwork初期的时候会清空wip.lanes)
				wip.lanes = current.lanes;
				// bailout
				return bailouOnAlreadyFinishedWork(wip, renderLane);
			}
		}
	}
	// 没有满足四要素
	return updateFunctionComponent(wip, Component, renderLane);
}

// 检查是否有调度Update或者context
// 返回值true为本次更新在fiber的未更新的Lanes集合中，(state有可能会发生改变，会产生新的变化)那就说明不能命中性能优化
// false说明本次更新没有在fiber的未更新的Lanes集合中，(state就不会发生改变，因为不会产生新的变化)那就说明命中了性能优化
function checkScheduledUpdateOrContext(
	current: FiberNode,
	renderLane: Lane
): boolean {
	// 用current是因为beginwork的时候wip.lanes被清空了
	// 产生update的时候，dispatch里面enqueueUpdate，enqueueUpdate中给fiber.lanes中添加Lane，并且添加到current.lanes中(如果fiber有Lanes)
	const updateLanes = current.lanes;

	// 判断fiber中未执行的更新中是否包含本次更新的renderLane，如果包含就存在更新
	if (includeSomeLanes(updateLanes, renderLane)) {
		return true;
	}
	return false;
}

// 能进bailouOnAlreadyFinishedWork这个方法说明wip已经满足bailout的四要素了，我们可以判断他的子树的优化程度
// bailouOnAlreadyFinishedWork 返回(复用)上次更新的结果
// renderLane本次更新的lane
// 命中「性能优化」（bailout 策略）的组件可以不通过 reconcile 生成 wip.child，
// 而是直接复用上次更新生成的 wip.child。bailout 策略存在于 beginWork 中
function bailouOnAlreadyFinishedWork(wip: FiberNode, renderLane: Lane) {
	// 判断优化程度
	// 本次更新不在wip子树的未更新集合中，那就说明wip的子树不会产生新的state变化，因为这次更新不到他）
	// 整颗子树都可以跳过render阶段
	if (!includeSomeLanes(wip.childLanes, renderLane)) {
		// wip的整颗子树都满足bailout
		if (__DEV__) {
			console.warn('bailout整棵子树', wip);
		}
		return null;
	}

	// 当前wip命中bailout。但是子树没有命中
	if (__DEV__) {
		console.warn('bailout一个fiber', wip);
	}

	// 克隆wip的child，
	// 不能直接return wip.child因为child是上次更新的时候的引用,这里我们克隆一下
	cloneChildFibers(wip);
	// 返回克隆的子节点
	return wip.child;
}

function updateSuspenseComponent(wip: FiberNode) {
	const current = wip.alternate;
	const nextProps = wip.pendingProps;

	// 是否展示fallback
	let showFallback = false;
	// 当前是不是挂起的状态 true为挂起(unwind后会给suspense标记DidCapture)
	const didSuspend = (wip.flags & DidCapture) !== NoFlags;
	if (didSuspend) {
		// 挂起 展示fallback
		showFallback = true;
		wip.flags &= ~DidCapture;
	}
	// children是一个元素
	// <Suspense fallback={<div>loading...</div>}>
	// 	<div>big</div>
	// </Suspense>;
	// // 编译后
	// import { jsx as _jsx } from 'react/jsx-runtime';
	// /*#__PURE__*/ _jsx(Suspense, {
	// fallback: /*#__PURE__*/ _jsx('div', {
	// 	children: 'loading...'
	// }),
	// children: /*#__PURE__*/ _jsx('div', {
	// 	children: 'big'
	// })
	// });
	const nextPrimayChildren = nextProps.children;
	const nextFallbackChildren = nextProps.fallback;
	// suspense入栈，为了unwind
	pushSuspenseHandler(wip);

	if (current === null) {
		// mount
		if (showFallback) {
			// 挂起
			return mountSuspenseFallbackChildren(
				wip,
				nextPrimayChildren,
				nextFallbackChildren
			);
		} else {
			// 正常流程
			return mountSuspensePrimaryChildren(wip, nextPrimayChildren);
		}
	} else {
		// update
		if (showFallback) {
			// 挂起
			return updateSuspenseFallbackChildren(
				wip,
				nextPrimayChildren,
				nextFallbackChildren
			);
		} else {
			// 正常流程
			return updateSuspensePrimaryChildren(wip, nextPrimayChildren);
		}
	}
}

// mount时的正常流程
// 由于不知道是否渲染fallback，所以这里不创建，只有当渲染fallback的时候才去创建fallback fragment fiber
function mountSuspensePrimaryChildren(
	wip: FiberNode, // suspense
	primayChildren: any
) {
	const primaryChildProps: OffscreenProps = {
		mode: 'visible', // 挂起
		children: primayChildren
	};
	// 创建suspense fiberNode的child
	// offscreen fiberNode(mode: hidden，显示他的sibling fallbackChild)
	const primaryChildFragment = createFiberFromOffscreen(primaryChildProps);
	wip.child = primaryChildFragment;
	primaryChildFragment.return = wip;
	return primaryChildFragment;
}

// mount时的挂起
function mountSuspenseFallbackChildren(
	wip: FiberNode, // suspense
	primaryChildren: any,
	fallbackChildren: any
) {
	const primaryChildProps: OffscreenProps = {
		mode: 'hidden', // 挂起
		children: primaryChildren
	};
	// 创建suspense fiberNode的两个child
	// offscreen fiberNode(mode: hidden，显示他的sibling fallbackChild)
	const primaryChildFragment = createFiberFromOffscreen(primaryChildProps);
	// offscreen fiberNode.sibling
	// fragment fibernode
	const fallbackChildFragment = createFiberFromFragment(fallbackChildren, null);

	// 打标记：Placement
	fallbackChildFragment.flags = Placement;

	primaryChildFragment.return = wip;
	fallbackChildFragment.return = wip;
	primaryChildFragment.sibling = fallbackChildFragment;
	wip.child = primaryChildFragment;

	// 当前mount挂起，显示fallback
	return fallbackChildFragment;
}

// update时的挂起
function updateSuspenseFallbackChildren(
	wip: FiberNode, // suspense
	primaryChildren: any,
	fallbackChildren: any
) {
	// 获取current fiber
	const current = wip.alternate as FiberNode;
	// 获取current的primayChildFragment
	const currentPrimaryChildFragment = current.child as FiberNode;
	// 获取current的fallbackChildFragment(mount可能没创建fallback，取到的就是Null)
	const currentFallbackChildFragment: FiberNode | null =
		currentPrimaryChildFragment.sibling;

	const primaryChildProps: OffscreenProps = {
		mode: 'hidden', // 挂起
		children: primaryChildren
	};
	// 复用
	// offscreen fiberNode(mode: hidden，显示他的sibling fallbackChild)
	const primaryChildFragment = createWorkInProgress(
		currentPrimaryChildFragment,
		primaryChildProps
	);
	// offscreen fiberNode.sibling
	// fragment fibernode
	let fallbackChildFragment;
	if (currentFallbackChildFragment !== null) {
		// 存在，复用
		fallbackChildFragment = createWorkInProgress(
			currentFallbackChildFragment,
			fallbackChildren
		);
	} else {
		// 不存在，新建
		fallbackChildFragment = createFiberFromFragment(fallbackChildren, null);
		// 打标记：Placement
		fallbackChildFragment.flags |= Placement;
	}
	fallbackChildFragment.return = wip;
	primaryChildFragment.return = wip;
	primaryChildFragment.sibling = fallbackChildFragment;
	wip.child = primaryChildFragment;

	return fallbackChildFragment;
}

// update时的正常流程
function updateSuspensePrimaryChildren(
	wip: FiberNode, // suspense
	primaryChildren: any
) {
	// current suspense fiber
	const current = wip.alternate as FiberNode;
	// 获取current的primayChildFragment
	const currentPrimaryChildFragment = current.child as FiberNode;
	// 获取current的fallbackChildFragment(mount可能没创建fallback，取到的就是Null)
	const currentFallbackChildFragment: FiberNode | null =
		currentPrimaryChildFragment.sibling;
	const primaryChildProps: OffscreenProps = {
		mode: 'visible', // 挂起
		children: primaryChildren
	};
	// 复用
	// offscreen fiberNode(mode: hidden，显示他的sibling fallbackChild)
	const primaryChildFragment = createWorkInProgress(
		currentPrimaryChildFragment,
		primaryChildProps
	);
	primaryChildFragment.return = wip;
	primaryChildFragment.sibling = null;
	wip.child = primaryChildFragment;
	// 如果存在currentFallbackChildFragment，移除
	if (currentFallbackChildFragment !== null) {
		const deletions = wip.deletions;
		if (deletions === null) {
			wip.deletions = [currentFallbackChildFragment];
			wip.flags |= ChildDeletion;
		} else {
			deletions.push(currentFallbackChildFragment);
		}
	}
	return primaryChildFragment;
}

function updateOffscreenComponent(wip: FiberNode) {
	const nextProps = wip.pendingProps;
	const nextChildren = nextProps.children;

	reconcileChildren(wip, nextChildren);
	return wip.child;
}

function updateContextProvider(wip: FiberNode) {
	// context.Provider = {
	// 	$$typeof: REACT_PROVIDER_TYPE,
	// 	// 指向Provider对应的context
	// 	_context: context
	// };
	// fiber.type 比如host类型 那就是div span，如果是函数组件，那就是函数组件本身 如果是provider那就是ctx.Provider
	const providerType = wip.type;
	const context = providerType._context;
	// const ctx = createContext(0);
	// function App() {
	// 	return (
	// 		<ctx.Provider value={1}>
	// 			<div>
	// 				<Middle />
	// 			</div>
	// 		</ctx.Provider>
	// 	);
	// }
	// <App />;
	// // 编译后
	// import { jsx as _jsx } from 'react/jsx-runtime';
	// const ctx = createContext(0);
	// function App() {
	// 	return /*#__PURE__*/ _jsx(ctx.Provider, {
	// 		value: 1,
	// 		children: /*#__PURE__*/ _jsx('div', {
	// 			children: /*#__PURE__*/ _jsx(Middle, {})
	// 		})
	// 	});
	// }
	const newProps = wip.pendingProps;

	// 更新context._currentValue
	pushProvider(context, newProps.value);

	const nextChildren = newProps.children;
	reconcileChildren(wip, nextChildren);

	return wip.child;
}

// 下面这句话的children都是ReactElement
// 无论hostRootFiber的children总是在fiber.memoizedState上, hostComponent的children在pendingProps 这样就是为了父fiber beginWork的时候根据对比儿子 current fiberNode与儿子 reactElement
// 从而得到儿子wip fiberNode

// HostRootFiber的beginwork流程
function updateHostRoot(wip: FiberNode, renderLane: Lane) {
	// 1.计算状态最新值
	const baseState = wip.memoizedState; // 首屏渲染不存在
	const updateQueue = wip.updateQueue as UpdateQueue<Element>;
	// pending => {action: reactElement}
	const pending = updateQueue.shared.pending;
	// 清空updateQueue
	// 这里注意一下
	// var a = {a:1} var b = {x: a}
	// b.x = null => b.x输出null
	// a = null => a输出null  但是我们创建的对象{a:1}还会在内存里，然后就进入了垃圾回收机制的范畴
	// 这里pending指向了updateQueue.shared.pending
	// 然后又将updateQueue.shared.pending指向了null
	updateQueue.shared.pending = null;

	// 保存上次更新的结果
	const prevChildren = wip.memoizedState;

	// 计算状态
	const { memoizedState } = processUpdateQueue(baseState, pending, renderLane);

	// 获取current，防止没有进入commit阶段，没有反转fiber树，导致的memoizedState丢失的情况
	// 考虑RootDidNotComplete的情况，需要复用memoizedState
	const current = wip.alternate;
	if (current !== null) {
		if (!current.memoizedState) {
			// 将memoizedState保存在current上，防止没有进入commit阶段,造成memoizedState丢失，因此再次render，可以从current中恢复出来memoizedState
			current.memoizedState = memoizedState;
		}
	}

	// 将最新的状态赋值给wip，这里memoizedState是根组件<App/>jsx生成的ReactElement
	wip.memoizedState = memoizedState;

	// render(<App/>) nextChildren为<App/>jsx生成的ReactElement
	const nextChildren = wip.memoizedState;
	// 是否命中bailout
	if (prevChildren === nextChildren) {
		return bailouOnAlreadyFinishedWork(wip, renderLane);
	}
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
	// 标记ref
	markRef(wip.alternate, wip);
	// 通过reconcile操作生成wip的child fiberNode
	reconcileChildren(wip, nextChildren);
	return wip.child;
}

// FunctionComponent的beginwork流程
function updateFunctionComponent(
	wip: FiberNode,
	Component: FiberNode['type'],
	renderLane: Lane
) {
	// 流程：普通jsx像下面的 babel帮我们生成jsx(div,{jsx(span)})然后再执行我们的jsx方法得到ReactElement，然后开始ReactDOM.createRoot(root).render(jsx(ReactElement));方法的流程
	// const jsx = (
	// 	<div><span>big-react</span></div>
	// );
	// 如果是像下面的函数组件，先编译为下面的函数，执行ReactDOM.createRoot(root).render(<App/>这里执行jsx(App,xxx),生成ReactElement);方法的流程，当遇到函数组件，
	// 执行renderWithHooks，这个函数里面会执行App方法，执行完App方法里面是babel帮我们生成的jsx(div,xxx)，需要再执行我们实现的jsx拿到ReactElement，再遇到函数组件
	// 再执行类似的流程
	// App babel编译后的结果
	// function App() {
	// 	return /*#__PURE__*/(0,react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_2__.jsxDEV)("div", {
	// 		children: /*#__PURE__*/(0,react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_2__.jsxDEV)(Child, {}, void 0, false, {
	// 			fileName: _jsxFileName,
	// 			lineNumber: 56,
	// 			columnNumber: 7
	// 		}, this)
	// 	}, void 0, false, {
	// 		fileName: _jsxFileName,
	// 		lineNumber: 55,
	// 		columnNumber: 5
	// 	}, this);
	// }
	// 为什么会造成jsx和APP的差异，因为babel编译完的函数并没有被执行，所以里面的jsx()方法也没有执行。而jsx直接编译为jsx(xxx)就直接执行我们的jsx方法了得到了ReactElement
	// <App/>编译后的结果就是 jsx(App, ...) 进入 ReactDOM.createRoot(root).render(jsx(App, ...)(<App/>)) 因为有<App/>这时候还是babel编译后的结果 需要执行我们的jsx方法得到ReactElement
	// 下面我们可以看到render()里面接受的参数是jsx()需要执行我们的jsx()方法得到ReactElement，但是上面的render(jsx)，遇到jsx直接帮我们执行了jsx()得到了ReatElement，所以这里的jsx就是编译好的ReactElement
	// react_dom__WEBPACK_IMPORTED_MODULE_1___default().createRoot(root).render( /*#__PURE__*/(0,react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_2__.jsxDEV)(App, {}, void 0, false, {
	// 	fileName: _jsxFileName,
	// 	lineNumber: 69,
	// 	columnNumber: 34
	// }, undefined));

	// App的child是div，为了能够得到div我们需要调用App()函数
	// function App(){
	// 	return (
	// 		<div>
	// 			<span>big-react</span>
	// 		</div>
	// 	)
	// }
	// 上述<App/> jsx 编译出来React.createElement()createElement方法得到的ReactElement为
	// {
	// 	$$typeof: Symbol(react.element),
	// 	key: null,
	// 	props: {},
	// 	ref: null,
	// 	type: f App()
	// }
	// 当我们拿到App函数然后在renderWithHooks里面执行，因为仍然是jsx编译好的React.creatElement('div'...)，所以会执行我们在react包里写好的React.creatElement方法
	// 并把这些参数传递进去，得到children(ReactElement),,如果里面reactElement还有子组件到时候仍然需要先执行函数再执行jsx()得到ReactElement
	// fiber.type 组件函数本身
	// ============================
	// props: click!!!!
	// function App(){
	// 	const onC = () => {console.log(111)}
	// 	return <Child onClick={onC}/>;
	// }

	// function Child({onClick}) {
	// 	return (
	// 		<div onClick={onClick}>111</div>
	// 	);
	// }
	// 编译完
	// import { jsx as _jsx } from "react/jsx-runtime";
	// function App() {
	// 	const onC = () => {
	// 		console.log(111);
	// 	};
	// 	return /*#__PURE__*/_jsx(Child, {
	// 		onClick: onC
	// 	});
	// }
	// function Child({
	// 	onClick
	// }) {
	// 	return /*#__PURE__*/_jsx("div", {
	// 		onClick: onClick, // 这里会被赋值给dom的onClick
	// 		children: "111"
	// 	});
	// }
	// ============================
	const nextChildren = renderWithHooks(wip, Component, renderLane);

	const current = wip.alternate;
	if (current !== null && !didReceiveUpdate) {
		// 重置操作
		bailoutHook(wip, renderLane);
		// 命中了bailout
		return bailouOnAlreadyFinishedWork(wip, renderLane);
	}

	reconcileChildren(wip, nextChildren);
	return wip.child;
}

// Fragment
function updateFragment(wip: FiberNode) {
	const nextChildren = wip.pendingProps;
	// fragment.pendingProps: {$$typeof: Symbol(react.element), key: null, props: {children: [reactElement, reactElement]}, ref: null, type: Symbol(react.fragment)}
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
		// 首屏渲染：hostRootFiber返回child 这里的child的flag会带上插入标记，归阶段回来后由于冒泡机制hostRootFiber的subtreeFlags上也是插入的标记
		wip.child = reconcileChildFibers(wip, current?.child, children);
	} else {
		// mount
		// 首屏渲染 性能优化，构建一个离屏dom树对根节点执行一次Placement，而不是每个dom都标记Placement
		// 首屏渲染：除了hostRootFiber，其他fiber走这里，避免每个fiber都标记Placement
		wip.child = mountChildFibers(wip, null, children);
	}
}

// 标记ref
function markRef(current: FiberNode | null, wip: FiberNode) {
	const ref = wip.ref;

	if (
		(current === null && ref !== null) ||
		(current !== null && current.ref !== ref)
	) {
		// mount时只要存在ref就标记
		// update时 ref引用变化
		wip.flags |= Ref;
	}
}
