import { ReactContext } from 'shared/ReactTypes';
import { FiberNode } from './fiber';
import {
	includeSomeLanes,
	isSubsetOfLanes,
	Lane,
	mergeLanes,
	NoLanes
} from './fiberLanes';
import { markWipReceivedUpdate } from './beginWork';
import { ContextProvider } from './workTags';

// 指向当前fiber依赖链表的最后一项
let lastContextDep: ContextItem<any> | null = null;

export interface ContextItem<Value> {
	context: ReactContext<Value>; // 保存的context
	memoizedState: Value; // context最新的值
	next: ContextItem<Value> | null; // 组件依赖的下一个context
}

let prevContextValue: any = null;
const prevContextValueStack: any[] = [];

// beginWork 入栈
// const ctx = createContext(0);

// <ctx.Provider value={1}>
//   <Cpn />
// </ctx.Provider>
// <Cpn />
// 以上面举例
// 进入到beginWork中
// prevContextValueStack.push(null)
// prevContextValue = context._currentValue => prevContextValue = 0
// context._currentValue = newValue; => context._currentValue => 1
export function pushProvider<T>(context: ReactContext<T>, newValue: T) {
	prevContextValueStack.push(prevContextValue);

	// 保存当前context当前的_currentValue
	prevContextValue = context._currentValue;
	// 将新的value赋值给context._currentValue
	context._currentValue = newValue;
}

// completeWork 出栈
// const ctx = createContext(0);

// <ctx.Provider value={1}>
//   <Cpn />
// </ctx.Provider>
// <Cpn />
// 继续这个例子
// context._currentValue = prevContextValue; => context._currentValue = 0
// prevContextValue = prevContextValueStack.pop(); => prevContextValue = null
export function popProvider<T>(context: ReactContext<T>) {
	// 上一个context._currentValue
	context._currentValue = prevContextValue;

	prevContextValue = prevContextValueStack.pop();
}

// fc component fiber render beginwork的时候，读取context的时候重置lastContextDep
export function prepareToReadContext(wip: FiberNode, renderLane: Lane) {
	lastContextDep = null;

	const deps = wip.dependencies;
	if (deps !== null) {
		const firstContext = deps.firstContext;
		if (firstContext !== null) {
			// 本次更新的lane在依赖的lanes中，那么不能命中bailout
			if (includeSomeLanes(deps.lanes, renderLane)) {
				// 不能命中bailout
				markWipReceivedUpdate();
			}
			// 接下来会重新创建context的依赖
			deps.firstContext = null;
		}
	}
}

export function readContext<T>(
	consumer: FiberNode | null,
	context: ReactContext<T>
): T {
	if (consumer === null) {
		throw new Error('只能在函数组件中调用useContext');
	}
	const value = context._currentValue;

	// 建立 fiber -> context
	const contextItem: ContextItem<T> = {
		context,
		next: null,
		memoizedState: value
	};

	if (lastContextDep === null) {
		// 函数render的时候第一个context
		lastContextDep = contextItem;
		consumer.dependencies = {
			firstContext: contextItem,
			lanes: NoLanes
		};
	} else {
		// 函数组件其他的context的依赖
		lastContextDep = lastContextDep.next = contextItem;
	}

	return value;
}

// wip: provider的fiber
export function propagateContextChange<T>(
	wip: FiberNode,
	context: ReactContext<T>,
	renderLane: Lane
) {
	let fiber = wip.child;
	if (fiber !== null) {
		fiber.return = wip;
	}

	while (fiber !== null) {
		let nextFiber = null;
		const deps = fiber.dependencies;
		if (deps !== null) {
			// 函数组件，依赖了某些context，但不确定是不是本次的provider
			nextFiber = fiber.child;

			let contextItem = deps.firstContext;
			while (contextItem !== null) {
				if (contextItem.context === context) {
					// 找到了
					fiber.lanes = mergeLanes(fiber.lanes, renderLane);
					const alternate = fiber.alternate;
					if (alternate !== null) {
						alternate.lanes = mergeLanes(alternate.lanes, renderLane);
					}
					// 往上
					scheduleContextWorkOnParentPath(fiber.return, wip, renderLane);
					deps.lanes = mergeLanes(deps.lanes, renderLane);
					break;
				}
				contextItem = contextItem.next;
			}
		} else if (fiber.tag === ContextProvider) {
			// 可能向下遍历的过程中遇到了其他的ctx.provider，如果是的其他的provider的话，我们跳过他，遍历他的child
			// 如果是本次更新的provider就不需要向下遍历了。
			nextFiber = fiber.type === wip.type ? null : fiber.child;
		} else {
			// 向下
			nextFiber = fiber.child;
		}

		if (nextFiber !== null) {
			nextFiber.return = fiber;
		} else {
			// 到了叶子结点
			nextFiber = fiber;
			while (nextFiber !== null) {
				if (nextFiber === wip) {
					nextFiber = null;
					break;
				}
				const sibling = nextFiber.sibling;
				if (sibling !== null) {
					sibling.return = nextFiber.return;
					nextFiber = sibling;
					break;
				}
				nextFiber = nextFiber.return;
			}
		}
		fiber = nextFiber;
	}
}

function scheduleContextWorkOnParentPath(
	from: FiberNode | null,
	to: FiberNode, // provider
	renderLane: Lane
) {
	let node = from;

	while (node !== null) {
		const alternate = node.alternate;

		if (!isSubsetOfLanes(node.childLanes, renderLane)) {
			node.childLanes = mergeLanes(node.childLanes, renderLane);
			if (alternate !== null) {
				alternate.childLanes = mergeLanes(alternate.childLanes, renderLane);
			}
		} else if (
			alternate !== null &&
			!isSubsetOfLanes(alternate.childLanes, renderLane)
		) {
			alternate.childLanes = mergeLanes(alternate.childLanes, renderLane);
		}

		if (node === to) {
			break;
		}
		node = node.return;
	}
}
