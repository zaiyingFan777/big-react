import { ReactContext } from 'shared/ReactTypes';
import { FiberNode } from './fiber';
import {
	includeSomeLanes,
	isSubsetOfLanes,
	Lane,
	mergeLanes,
	NoLanes
} from './fiberLanes';
import { markWipReceiveUpdate } from './beginWork';
import { ContextProvider } from './workTags';

// 指向依赖链表的最后一项，全局的变量，每次开始读一个context之前需要重置
let lastContextDep: ContextItem<any> | null = null;

export interface ContextItem<Value> {
	context: ReactContext<Value>;
	memoizedState: Value; // 保存context最新的值
	next: ContextItem<Value> | null;
}

// 记录上一次context的value
let prevContextValue: any = null;
const prevContextValueStack: any[] = [];

// const ctx = createContext(0); context._currentValue = 0
// <ctx.Provider value={1}>  // 入栈：prevContextValueStack: [null]; prevContextValue = context._currentValue = 0; context._currentValue = 1;
//   <Cpn />    // context._currentValue = 1;
// </ctx.Provider> // 出栈 context._currentValue = prevContextValue = 0; prevContextValue = [null].pop() = null;
// <Cpn /> // context._currentValue = 0;

// 入栈  beginWork
export function pushProvider<T>(context: ReactContext<T>, newValue: T) {
	prevContextValueStack.push(prevContextValue);
	// 记录上一次context._currentvalue
	prevContextValue = context._currentValue;
	context._currentValue = newValue;
}

// 出栈 completeWork
export function popProvider<T>(context: ReactContext<T>) {
	context._currentValue = prevContextValue; /* 上一个context._currentValue */

	// 出栈（取出最后一个元素并赋值给prevContextValueStack）
	prevContextValue = prevContextValueStack.pop();
}

export function prepareToReadContext(wip: FiberNode, renderLane: Lane) {
	// 每次读一个context需要重置
	lastContextDep = null;

	const deps = wip.dependencies;
	if (deps !== null) {
		// 拿到第一个依赖的context
		const firstContext = deps.firstContext;
		if (firstContext !== null) {
			if (includeSomeLanes(deps.lanes, renderLane)) {
				// dep.lanes: context对应的更新的lane和本次更新的lane是否有包含，如果有，代表本次更新的renderLane会改变某个context的值
				// 不能命中bailout
				markWipReceiveUpdate();
			}
			// 重置，下面readContext会重建
			deps.firstContext = null;
		}
	}
}

// const x = useContext(ctx)
export function readContext<T>(
	consumer: FiberNode | null,
	context: ReactContext<T>
): T {
	// 消费者为当前正在工作的fiebr
	// const consumer = currentlyRenderingFiber;
	if (consumer === null) {
		// 脱离了函数组件的使用
		// throw new Error('useContext must be inside a function component');
		throw new Error('只能在函数组件中调用useContext');
	}

	const value = context._currentValue;

	// 建立 fiber和context的依赖
	const contextItem: ContextItem<T> = {
		context,
		memoizedState: value,
		next: null
	};

	if (lastContextDep === null) {
		// 当前函数遇到的第一个context
		lastContextDep = contextItem;
		// 给fiebr增加dependencies
		consumer.dependencies = {
			lanes: NoLanes,
			firstContext: contextItem
		};
	} else {
		// 移动指针
		lastContextDep = lastContextDep.next = contextItem;
	}

	return value;
}

// 在context.provider的beginwork流程中的向下深度优先遍历(不是本身beginwork的深度优先遍历)
// 传递了context变化的消息 到依赖了变化的context的fiber中
export function propagateContextChange<T>(
	wip: FiberNode, // 从wip出发
	context: ReactContext<T>, // 目标context
	renderLane: Lane // 本次更新的优先级
) {
	let fiber = wip.child;
	if (fiber !== null) {
		// 手动保持链接
		fiber.return = wip;
	}
	// 往下深度优先遍历
	while (fiber !== null) {
		// 指向下一个要遍历的fiber
		let nextFiber = null;
		const deps = fiber.dependencies;
		if (deps !== null) {
			// 这个fiber是函数组件，并依赖了某些context，但是不确定是否为当前目标context
			// fiber为找到的函数组件 nextFiber指向函数组件的child
			nextFiber = fiber.child;

			// 找到这个函数组件保存的context单向链表
			let contextItem = deps.firstContext;
			while (contextItem !== null) {
				// 找到了依赖的这个变化的context的函数组件
				if (contextItem.context === context) {
					// 给这个fiber的lanes上增加本次更新的lane
					fiber.lanes = mergeLanes(fiber.lanes, renderLane);
					const alternate = fiber.alternate;
					if (alternate !== null) {
						// 给alternate也附加上
						alternate.lanes = mergeLanes(alternate.lanes, renderLane);
					}
					// 从找到的这个fiber向上归，并给沿途的fiber.childLanes都添加上本次更新的lane
					// 从当前节点的父级 到 context.provider
					scheduleContextWorkOnParentPath(fiber.return, wip, renderLane);
					// 并且给fiber.dependencies.lanes上增加本次更新的lane
					deps.lanes = mergeLanes(deps.lanes, renderLane);
					break;
				}
				contextItem = contextItem.next;
			}
		} else if (fiber.tag === ContextProvider) {
			// 又遇到了其他的provider，1.如果还是当前的provider，可以停止深度优先遍历，让遇到的这个他进行beginwork的时候深度优先遍历即可
			// 2.如果不是当前的provider，返回遇到的provider的child继续深度优先遍历即可
			// <ctx.Provider>
			// 	<Cpn/>
			// 	<div>
			// 		<ctx2.Provider></ctx2.Provider>
			// 	</div>
			// </ctx.Provider>
			nextFiber = fiber.type === wip.type ? null : fiber.child;
		} else {
			// 继续向下
			nextFiber = fiber.child;
		}

		if (nextFiber !== null) {
			// 保持链接
			nextFiber.return = fiber;
		} else {
			// 到了叶子节点, nextFiber为null
			// 向上归
			nextFiber = fiber;
			while (nextFiber !== null) {
				// 往上归的终止条件
				if (nextFiber === wip) {
					nextFiber = null;
					break;
				}
				// 寻找兄弟节点，然后兄弟节点继续向下深度优先遍历
				const sibling = nextFiber.sibling;
				if (sibling !== null) {
					// 保持链接
					sibling.return = nextFiber.return;
					nextFiber = sibling;
					break;
				}
				// 兄弟节点为空，继续向上归
				nextFiber = nextFiber.return;
			}
		}
		fiber = nextFiber;
	}
}

// 找到了依赖的context变化的组件 并在provider的beginwork中向上遍历的过程(给沿途fiber.childLanes上增加lane)
function scheduleContextWorkOnParentPath(
	from: FiberNode | null,
	to: FiberNode,
	renderLane: Lane
) {
	let node = from;

	// 向上遍历
	while (node !== null) {
		const alternate = node.alternate;

		if (!isSubsetOfLanes(node.childLanes, renderLane)) {
			// 当前node.childLanes不包含本次更新的lane，就附加上
			node.childLanes = mergeLanes(node.childLanes, renderLane);

			if (alternate !== null) {
				alternate.childLanes = mergeLanes(alternate.childLanes, renderLane);
			}
		} else if (
			alternate !== null &&
			!isSubsetOfLanes(alternate.childLanes, renderLane)
		) {
			// 包含，但是不在current(alternate)上
			alternate.childLanes = mergeLanes(alternate.childLanes, renderLane);
		}

		// 终止条件
		if (node === to) {
			break;
		}

		// 继续向上
		node = node.return;
	}
}
