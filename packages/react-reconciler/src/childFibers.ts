import { REACT_ELEMENT_TYPE, REACT_FRAGMENT_TYPE } from 'shared/ReactSymbols';
import { Key, Props, ReactElementType } from 'shared/ReactTypes';
import {
	createFiberFromElement,
	createFiberFromFragment,
	createWorkInProgress,
	FiberNode
} from './fiber';
import { ChildDeletion, Placement } from './fiberFlags';
import { Fragment, HostText } from './workTags';

type ExistingChildren = Map<string | number, FiberNode>;

// shouldTrackEffects为False的时候不需要标记副作用,比如
// beginWork性能优化策略
// 考虑如下结构的reactElement：
// <div>
//   <p>练习时长</p>
//   <span>两年半</span>
// </div>
// 理论上mount流程完毕后包含的flags：
// 1.两年半 Placement
// 2.span Placement
// 3.练习时长 Placement
// 4.p Placement
// 5.div Placement
// 相比于执行5次Placment，我们可以构建好「离屏DOM树」后，对div执行1次Placement操作
function ChildReconciler(shouldTrackEffects: boolean) {
	// 在returnFiber中删除childToDelete
	function deleteChild(returnFiber: FiberNode, childToDelete: FiberNode) {
		if (!shouldTrackEffects) {
			return;
		}
		// deletions: 父节点的一个数组结构，保存了父节点下需要被删除的子节点
		const deletions = returnFiber.deletions;
		if (deletions === null) {
			returnFiber.deletions = [childToDelete];
			// 给父节点添加标记
			returnFiber.flags |= ChildDeletion;
		} else {
			deletions.push(childToDelete);
		}
	}

	function deleteRemainingChildren(
		returnFiber: FiberNode,
		currentFirstChild: FiberNode | null
	) {
		if (!shouldTrackEffects) {
			return;
		}
		let childToDelete = currentFirstChild;
		while (childToDelete !== null) {
			deleteChild(returnFiber, childToDelete);
			childToDelete = childToDelete.sibling;
		}
	}

	// 单节点diff 更新前 div 更新后 div、p
	function reconcileSingleElement(
		returnFiber: FiberNode,
		currentFiber: FiberNode | null,
		element: ReactElementType
	) {
		const key = element.key;
		while (currentFiber !== null) {
			// update
			if (currentFiber.key === key) {
				// key相同
				if (element.$$typeof === REACT_ELEMENT_TYPE) {
					if (currentFiber.type === element.type) {
						let props = element.props;
						if (element.type === REACT_FRAGMENT_TYPE) {
							// * 处理fragment
							props = element.props.children;
						}
						// type相同
						// * key相同 type相同 可以复用
						const existing = useFiber(currentFiber, props);
						existing.return = returnFiber;
						// * 当前节点可复用，标记剩下的节点删除
						// A1 B2 C3 -> A1，删除B2、C3
						deleteRemainingChildren(returnFiber, currentFiber.sibling);
						return existing;
					}
					// * key相同、type不同，不能复用，删除旧的
					// * A1 B2 C3 -> B1,不存在任何复用的可能性，需要把A1、B2、C3都删除，新建B1
					deleteRemainingChildren(returnFiber, currentFiber);
					break;
				} else {
					if (__DEV__) {
						console.warn('还未实现的react类型', element);
						break;
					}
				}
			} else {
				// * key不同，删除当前key不同的current fiber，再去遍历current.兄弟节点
				// 删掉旧的
				deleteChild(returnFiber, currentFiber);
				// 遍历current的兄弟节点
				currentFiber = currentFiber.sibling;
			}
		}

		// * 根据element 创建新的fiberNode
		let fiber;
		if (element.type === REACT_FRAGMENT_TYPE) {
			fiber = createFiberFromFragment(element.props.children, key);
		} else {
			fiber = createFiberFromElement(element);
		}
		fiber.return = returnFiber;
		return fiber;
	}

	function reconcileSingleTextNode(
		returnFiber: FiberNode,
		currentFiber: FiberNode | null,
		content: string | number
	) {
		while (currentFiber !== null) {
			// update
			if (currentFiber.tag === HostText) {
				// 类型没变，可以复用
				const existing = useFiber(currentFiber, { content });
				existing.return = returnFiber;
				// 当前可复用，删除current的其他兄弟节点
				deleteRemainingChildren(currentFiber, currentFiber.sibling);
				return existing;
			}
			// * old
			// * currentFiber不是hostText
			// * div -> hahaha，先删除div，再生成hahaha文本节点
			// 如果类型变了，则删除currentFiber
			deleteChild(returnFiber, currentFiber);
			// * new
			// * 当前节点不能复用，删除当前节点，去看兄弟节点是否能服用
			currentFiber = currentFiber.sibling;
		}

		const fiber = new FiberNode(HostText, { content }, null);
		fiber.return = returnFiber;
		return fiber;
	}

	function placeSingleChild(fiber: FiberNode) {
		if (shouldTrackEffects && fiber.alternate === null) {
			// 1.需要追踪副作用
			// 2.fiber(wip).alternate == null 即 current == null
			// 3.由2可得：是首屏渲染
			fiber.flags |= Placement;
		}
		return fiber;
	}

	function reconcileChildrenArray(
		returnFiber: FiberNode,
		currentFirstChild: FiberNode | null,
		newChild: any[]
	) {
		// 最后一个可复用fiber在current中的index
		let lastPlacedIndex = 0;
		// 创建的最后一个fiber
		let lastNewFiber: FiberNode | null = null;
		// * 创建的第一个fiber, 最后reconcileChildrenArray返回这个变量
		let firstNewFiber: FiberNode | null = null;

		// * 1.将current保存在map中，current fiber的key/index作为key，current fiber作为val
		const existingChildren: ExistingChildren = new Map();
		let current = currentFirstChild;
		while (current !== null) {
			const keyToUse = current.key !== null ? current.key : current.index;
			existingChildren.set(keyToUse, current);
			current = current.sibling;
		}

		for (let i = 0; i < newChild.length; i++) {
			// * 2.遍历newChild，寻找是否可复用
			const after = newChild[i];
			const newFiber = updateFromMap(returnFiber, existingChildren, i, after);

			if (newFiber === null) {
				continue;
			}

			// * 3. 标记移动还是插入
			newFiber.index = i;
			newFiber.return = returnFiber;

			if (lastNewFiber === null) {
				lastNewFiber = newFiber;
				firstNewFiber = newFiber;
			} else {
				lastNewFiber.sibling = newFiber;
				lastNewFiber = lastNewFiber.sibling;
			}

			if (!shouldTrackEffects) {
				continue;
			}

			const current = newFiber.alternate;
			if (current !== null) {
				const oldIndex = current.index;
				if (oldIndex < lastPlacedIndex) {
					// 移动
					newFiber.flags |= Placement;
					continue;
				} else {
					// 不移动，更新lastPlacedIndex
					lastPlacedIndex = oldIndex;
				}
			} else {
				// mount
				newFiber.flags |= Placement;
			}
		}
		// * 4. 将Map中剩下的标记为删除
		existingChildren.forEach((fiber) => {
			deleteChild(returnFiber, fiber);
		});
		// * 5. 返回本轮diff后产生的第一个wip fiber
		return firstNewFiber;
	}

	function getElementKeyToUse(element: any, index?: number): Key {
		if (
			Array.isArray(element) ||
			typeof element === 'string' ||
			typeof element === 'number'
		) {
			return index;
		}
		return element.key !== null ? element.key : index;
	}

	function updateFromMap(
		returnFiber: FiberNode,
		existingChildren: ExistingChildren,
		index: number,
		element: any
	): FiberNode | null {
		const keyToUse = getElementKeyToUse(element, index);
		const before = existingChildren.get(keyToUse);

		// HostText
		if (typeof element === 'string' || typeof element === 'number') {
			if (before) {
				if (before.tag === HostText) {
					existingChildren.delete(keyToUse);
					return useFiber(before, { content: element + '' });
				}
			}
			return new FiberNode(HostText, { content: element + '' }, null);
		}

		// ReactElement
		if (typeof element === 'object' && element !== null) {
			switch (element.$$typeof) {
				case REACT_ELEMENT_TYPE:
					if (element.type === REACT_FRAGMENT_TYPE) {
						// * 处理 Fragment
						return updateFragment(
							returnFiber,
							before,
							element,
							keyToUse,
							existingChildren
						);
					}
					if (before) {
						if (before.type === element.type) {
							existingChildren.delete(keyToUse);
							return useFiber(before, element.props);
						}
					}
					return createFiberFromElement(element);
			}

			// *数组类型，我们也当成Fragment来处理
			// <ul>
			// 	<li/>
			// 	<li/>
			// 	{[<li/>, <li/>]}
			// </ul>

			// <ul>
			// 	<li/>
			// 	<li/>
			// 	<>
			// 			<li/>
			// 			<li/>
			// 	</>
			// </ul>
			if (Array.isArray(element)) {
				return updateFragment(
					returnFiber,
					before,
					element,
					keyToUse,
					existingChildren
				);
			}
		}
		return null;
	}

	return function reconcileChildFibers(
		returnFiber: FiberNode,
		currentFiber: FiberNode | null,
		newChild?: any
	) {
		// 判断Fragment
		// isUnkeyedTopLevelFragment组件的根节点是Fragement，且没有key
		const isUnkeyedTopLevelFragment =
			typeof newChild === 'object' &&
			newChild !== null &&
			newChild.type === REACT_FRAGMENT_TYPE &&
			newChild.key === null;
		if (isUnkeyedTopLevelFragment) {
			// newChild为数组
			// [
			// 	ReactElement,
			// 	ReactElement
			// ]
			// * 然后接着走下面的Array.isArray(newChild)逻辑
			console.log(returnFiber, currentFiber, newChild);
			newChild = newChild.props.children;
		}

		// 判断当前fiber的类型
		if (typeof newChild === 'object' && newChild !== null) {
			// * 多节点的情况 ul> li*3
			if (Array.isArray(newChild)) {
				return reconcileChildrenArray(returnFiber, currentFiber, newChild);
			}

			switch (newChild.$$typeof) {
				case REACT_ELEMENT_TYPE:
					return placeSingleChild(
						reconcileSingleElement(returnFiber, currentFiber, newChild)
					);
				default:
					if (__DEV__) {
						console.warn('未实现的reconcile类型', newChild);
					}
					break;
			}
		}

		// HostText
		if (typeof newChild === 'string' || typeof newChild === 'number') {
			return placeSingleChild(
				reconcileSingleTextNode(returnFiber, currentFiber, newChild)
			);
		}

		if (currentFiber !== null) {
			// * 兜底删除
			// 当「旧 fiber 存在（currentFiber ≠ null）」
			// 且「newChild 不是 element / text / number / 未实现分支处理的类型」时
			// 就会进入这个“兜底删除”逻辑。
			deleteRemainingChildren(returnFiber, currentFiber);
		}

		if (__DEV__) {
			console.warn('未实现的reconcile类型', newChild);
		}
		return null;
	};
}

// 复用fiber
function useFiber(fiber: FiberNode, pendingProps: Props): FiberNode {
	const clone = createWorkInProgress(fiber, pendingProps);
	clone.index = 0;
	clone.sibling = null;
	return clone;
}

function updateFragment(
	returnFiber: FiberNode,
	current: FiberNode | undefined,
	elements: any[],
	key: Key,
	existingChildren: ExistingChildren
) {
	let fiber;
	if (!current || current.tag !== Fragment) {
		// cur不存在或者cur不是Fragment，则新建Fragment
		fiber = createFiberFromFragment(elements, key);
	} else {
		// cur存在，且更新前后都是Fragment
		existingChildren.delete(key); // 删掉key，接着下面的复用
		fiber = useFiber(current, elements);
	}
	fiber.return = returnFiber;
	return fiber;
}

export const reconcileChildFibers = ChildReconciler(true);
export const mountChildFibers = ChildReconciler(false);
