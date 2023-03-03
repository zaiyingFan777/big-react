// 生成子节点以及标记flags的过程
import { Key, Props, ReactElementType } from 'shared/ReactTypes';
import {
	FiberNode,
	createFiberFromElement,
	createFiberFromFragment,
	createWorkInProgress
} from './fiber';
import { REACT_ELEMENT_TYPE, REACT_FRAGMENT_TYPE } from 'shared/ReactSymbols';
import { Fragment, HostText } from './workTags';
import { ChildDeletion, Placement } from './fiberFlags';

type ExistingChildren = Map<string | number, FiberNode>;

function ChildReconciler(shouldTrackEffects: boolean) {
	// 删除子节点
	function deleteChild(returnFiber: FiberNode, childToDelete: FiberNode) {
		if (!shouldTrackEffects) {
			return;
		}
		// 需要追踪副作用
		const deletions = returnFiber.deletions; // 保存了父节点下需要删除的子节点
		if (deletions === null) {
			// 没有deletions需要创建数组并将要删除的childToDelete放进去
			returnFiber.deletions = [childToDelete];
			// 给父节点增加删除子节点的flags
			returnFiber.flags |= ChildDeletion;
		} else {
			deletions.push(childToDelete);
		}
	}

	// 删除兄弟节点
	function deleteRemainingChildren(
		returnFiber: FiberNode,
		currentFirstChild: FiberNode | null
	) {
		// 不要需要追踪副作用return
		if (!shouldTrackEffects) {
			return;
		}
		let childToDelete = currentFirstChild;
		while (childToDelete !== null) {
			deleteChild(returnFiber, childToDelete);
			childToDelete = childToDelete.sibling;
		}
	}

	// 1 单节点->单节点
	// A1 -> B1 key相同 type不同 删除重新创建 不能复用
	// A1 -> A2 key不同 type相同 删除重新创建 不能复用
	// 2 多节点变为单节点
	// ABC->A也属于单节点diff
	// 	key相同，type相同 == 复用当前节点
	// 例如：A1 B2 C3 -> A1
	// key相同，type不同 == 不存在任何复用的可能性，因为key是唯一的
	// 例如：A1 B2 C3 -> B1
	// key不同，type相同  == 当前节点不能复用，需要遍历其他节点
	// key不同，type不同 == 当前节点不能复用，需要遍历其他节点
	function reconcileSingleElement(
		returnFiber: FiberNode,
		currentFiber: FiberNode | null,
		element: ReactElementType
	) {
		const key = element.key;
		// key type相同才能复用
		while (currentFiber !== null) {
			// update
			if (currentFiber.key === key) {
				// key相同，比较type
				if (element.$$typeof === REACT_ELEMENT_TYPE) {
					if (currentFiber.type === element.type) {
						let props = element.props;
						if (element.type === REACT_FRAGMENT_TYPE) {
							// 处理Fragment
							props = element.props.children;
						}
						// key相同、type也相同，复用
						const existing = useFiber(currentFiber, props);
						existing.return = returnFiber;
						// A1 B2 C3 -> A1
						// 当前节点可以复用，标记剩下的节点删除
						deleteRemainingChildren(returnFiber, currentFiber.sibling);
						return existing;
					}
					// key相同 type不同 删除掉所有旧的
					deleteRemainingChildren(returnFiber, currentFiber);
					// 下面再重新创建新的fiber
					break;
				} else {
					if (__DEV__) {
						console.warn('还未实现的react类型', element);
						break;
					}
				}
			} else {
				// key不同，删除当前key不同的child，遍历其他sibling
				deleteChild(returnFiber, currentFiber);
				currentFiber = currentFiber.sibling;
			}
		}
		// 创建新的
		// 根据element创建fiber
		let fiber;
		if (element.type === REACT_FRAGMENT_TYPE) {
			// 创建新的FRAGMENT
			fiber = createFiberFromFragment(element.props.children, key);
		} else {
			fiber = createFiberFromElement(element);
		}
		fiber.return = returnFiber;
		return fiber;
	}

	// 处理复用fiberNode的函数
	function useFiber(fiber: FiberNode, pendingProps: Props): FiberNode {
		const clone = createWorkInProgress(fiber, pendingProps);
		clone.index = 0;
		clone.sibling = null;
		return clone;
	}

	// 文本
	function reconcileSingleTextNode(
		returnFiber: FiberNode,
		currentFiber: FiberNode | null,
		content: string | number
	) {
		while (currentFiber !== null) {
			// update
			if (currentFiber.tag === HostText) {
				// 类型type没变，可以复用
				const existing = useFiber(currentFiber, { content });
				existing.return = returnFiber;
				// 当前节点可以复用，标记剩下的节点删除
				deleteRemainingChildren(returnFiber, currentFiber.sibling);
				return existing;
			}
			// tag、type变了 <div>(hostComponent) => hahah(HostText)
			// 先删除之前的fiber
			deleteChild(returnFiber, currentFiber);
			// 寻找其他兄弟节点看有能复用的不
			currentFiber = currentFiber.sibling;
		}
		// 根据element创建fiber
		const fiber = new FiberNode(HostText, { content }, null);
		fiber.return = returnFiber;
		return fiber;
	}

	// 插入一个单一的节点
	function placeSingleChild(fiber: FiberNode) {
		// fiber刚创建的fiebr，就是workInProgress fiber
		// fiber.alternate为current fiber， current fiber为null就是首屏渲染
		// FiberRootNode -> hostRootFiber -(reconcileChildFibers, shouldTrackEffects为true)-> App 这里的fiber就是app，app的alternate是null，所以给app组件有个插入的标记
		if (shouldTrackEffects && fiber.alternate === null) {
			fiber.flags |= Placement;
		}
		return fiber;
	}

	// 多节点diff ul > li*3
	// 对于同级多节点Diff的支持

	// 单节点需要支持的情况：
	// 插入 Placement
	// 删除 ChildDeletion

	// 多节点需要支持的情况：
	// 插入 Placement
	// 删除 ChildDeletion
	// 移动 Placement

	// 整体流程分为4步。
	// 1.将current中所有同级fiber保存在Map中
	// 2.遍历newChild数组，对于每个遍历到的element，存在两种情况：
	//   1.在Map中存在对应current fiber，且可以复用
	//   2.在Map中不存在对应current fiber，或不能复用
	// 3.判断是插入还是移动
	// 4.最后Map中剩下的都标记删除

	// reconcileChildrenArray返回的是children中第一个fiber
	function reconcileChildrenArray(
		returnFiber: FiberNode,
		currentFirstChild: FiberNode | null,
		newChild: any[]
	) {
		// 保存最后一个可复用的fiber在current中的索引位置
		let lastPlacedIndex = 0;
		// 创建的最后一个fiber
		let lastNewFiber: FiberNode | null = null;
		// 创建的第一个fiber
		let firstNewFiber: FiberNode | null = null;

		// 1.将current保存在map中
		const existingChildren: ExistingChildren = new Map();
		// current就是当前的节点(fiberNode)，newChild为reactElement的[reactElement]
		let current = currentFirstChild;
		while (current !== null) {
			// 有key用key，没key用index
			const keyToUse = current.key !== null ? current.key : current.index;
			existingChildren.set(keyToUse, current);
			current = current.sibling;
		}

		for (let i = 0; i < newChild.length; i++) {
			// 2.遍历newChild，寻找是否可复用
			// 首先，根据key(newChild的key)从Map中获取current fiber，如果不存在current fiber，则没有复用的可能。
			// 接下来，分情况讨论：
			// element(newChild)是HostText，current fiber是么？
			// element是其他ReactElement，current fiber是么？
			// TODO element是数组或Fragment，current fiber是么？
			const after = newChild[i];
			const newFiber = updateFromMap(returnFiber, existingChildren, i, after);

			// 不管你更新前是什么，更新之后是false，null 最后返回null.
			if (newFiber === null) {
				continue;
			}

			// 3.标记移动还是插入
			// 「移动」具体是指「向右移动」
			// 移动的判断依据：element的index与「element对应current fiber」的index的比较 比如A1更新前为0，更新后为2
			// A1 B2 C3 -> B2 C3 A1  // 由于A1没有before，placement最终执行parent.appendChild
			// 0__1__2______0__1__2
			// 比如
			// <div id="p">
			// 	<div id="c1">c1</div>
			// 	<div id="c2">c2</div>
			// </div>;
			// 执行document.querySelector('#p').appendChild(document.querySelector('#c1'));
			// 然后变为了
			// <div id="p">
			// 	<div id="c2">c2</div>
			// 	<div id="c1">c1</div>
			// </div>;
			// 这时候就变为了节点移动，而不需要删除谁再插入谁，我就怎么没想到呢，哈哈哈
			// commitRoot的时候，其实是对着wip去做的。比如a1 -> c3这时候 我们wip中会有childDelete[a1]，先插入c3，然后删除a1.因为我们diff出来的结果就是wip树
			// 我们去操作的时候肯定拿着wip去看具体的标记去操作。
			// 当遍历element时，「当前遍历到的element」一定是「所有已遍历的element」中最靠右那个。
			// 所以只需要记录「最后一个可复用fiber」在current中的index（lastPlacedIndex）(ps: 比如B2是可复用的fiber，B2在current中的index为1, lastPlacedIndex为1)，在接下来的遍历中：
			// (比如B2 lastPlacedIndex为1，然后C3也是可复用的，他在current中的index为2，2>1所以就不需要移动，事实也是变化前B2 C3,变化后依然是B2 C3,位置就没动，这时候lastPlacedIndex为2，
			// 接下来A1是可复用的，他的currentfiber对应的索引值为0，0 < lastPlacedInde 2，因为A1更新前在C3左边，更新后在C3右边了，这时候需要标记A1 Placement)
			//   如果接下来遍历到的「可复用fiber」的index < lastPlacedIndex，则标记Placement
			//   否则，不标记
			newFiber.index = i;
			newFiber.return = returnFiber;

			// lastNewFiber始终指向最后一个新的fiber
			// firstNewFiber始终指向第一个新的fiber
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
			// 判断是否移动
			const current = newFiber.alternate;
			if (current !== null) {
				// 如果用个例子来说就是这样：
				// 从：a b c
				// 到：c b a
				// oldIndexC 2  > lastPlacedIndex 0
				// lastPlacedIndex = 2
				// oldIndexB 1  < lastPlacedIndex 2
				// b |= Placement
				// oldIndexA 0  < lastPlacedIndex 2
				// a |= Placement
				const oldIndex = current.index;
				// 如果接下来遍历到的「可复用fiber」的index < lastPlacedIndex，则标记Placement
				if (oldIndex < lastPlacedIndex) {
					// 移动
					newFiber.flags |= Placement;
					continue;
				} else {
					// 不移动
					lastPlacedIndex = oldIndex;
				}
			} else {
				// mount
				newFiber.flags |= Placement;
			}
		}
		// 4.将Map中剩下的标记为删除(因为剩下的没有移动或者插入，只能是删除)
		existingChildren.forEach((fiber) => {
			deleteChild(returnFiber, fiber);
		});
		return firstNewFiber;
	}

	function updateFromMap(
		returnFiber: FiberNode,
		existingChildren: ExistingChildren,
		index: number,
		element: any
	): FiberNode | null {
		// 有Key用Key,反之用索引位置
		let keyToUse = element.key !== null ? element.key : index;
		// 兼容数组的情况，key为undefined，取索引
		if (Array.isArray(element)) {
			keyToUse = index;
		}
		// 获取当前的fiber节点
		const before = existingChildren.get(keyToUse);
		// element(newChild)是HostText，current fiber是么？
		if (typeof element === 'string' || typeof element === 'number') {
			// HostText
			if (before) {
				if (before.tag === HostText) {
					// 如果更新前也是HostText，更新后也是HostText，可以删除之前的fiber，直接复用
					existingChildren.delete(keyToUse);
					// 复用
					return useFiber(before, { content: element + '' });
				}
			}
			// 不能复用返回一个新的fiber节点
			return new FiberNode(HostText, { content: element + '' }, null);
		}

		// element是其他ReactElement，current fiber是么？
		if (typeof element === 'object' && element !== null) {
			switch (element.$$typeof) {
				case REACT_ELEMENT_TYPE:
					// 处理Fragment，这时候ul的children是array(reconcileChildrenArray)
					// 然后数组的第一个元素屎Fragment，
					// jsxs('ul', {
					// 	children: [
					// 		jsxs(Fragment, {
					// 			children: [
					// 				jsx('li', {
					// 					children: '1'
					// 				}),
					// 				jsx('li', {
					// 					children: '2'
					// 				})
					// 			]
					// 		}),
					// 		jsx('li', {
					// 			children: '3'
					// 		}),
					// 		jsx('li', {
					// 			children: '4'
					// 		})
					// 	]
					// });
					if (element.type === REACT_FRAGMENT_TYPE) {
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
							// key type都相同，复用
							// 先删除map保存的currentFiber
							existingChildren.delete(keyToUse);
							return useFiber(before, element.props);
						}
					}
					// 创建新节点
					return createFiberFromElement(element);
			}
			// TODO 数组类型
			// TODO element是数组或Fragment，current fiber是么？
			if (Array.isArray(element) && __DEV__) {
				console.warn('还未实现数组类型的child');
			}
		}

		// jsxs('ul', {
		// 	children: [
		// 		jsx('li', {
		// 			children: 'a'
		// 		}),
		// 		jsx('li', {
		// 			children: 'b'
		// 		}),
		// 		arr
		// 	]
		// });
		// arr fragment
		if (Array.isArray(element)) {
			return updateFragment(
				returnFiber,
				before,
				element,
				keyToUse,
				existingChildren
			);
		}
		return null;
	}

	function updateFragment(
		returnFiber: FiberNode,
		current: FiberNode | undefined,
		elements: any[], // fragment的children
		key: Key,
		existingChildren: ExistingChildren
	) {
		let fiber;
		if (!current || current.tag !== Fragment) {
			// current fiber不存在或者current的tag不是Fragment
			// 创建新的Fragment对应的Fiber
			fiber = createFiberFromFragment(elements, key);
		} else {
			// current存在，且更新前后为Fragment
			// 被复用，删除掉map对应的key
			existingChildren.delete(key);
			fiber = useFiber(current, elements);
		}
		fiber.return = returnFiber;
		return fiber;
	}

	// shouldTrackEffects 是否追踪副作用 true为追踪，false为不追踪 就不用标记flags
	return function reconcileChildFibers(
		returnFiber: FiberNode,
		currentFiber: FiberNode | null,
		newChild?: ReactElementType
	) {
		// 判断Fragment
		const isUnkeyedTopLevelFragment =
			typeof newChild === 'object' &&
			newChild !== null &&
			newChild.type === REACT_FRAGMENT_TYPE &&
			newChild.key === null;
		if (isUnkeyedTopLevelFragment) {
			// Unkeyed: 没有key属性，TopLevel: 组件的根节点是Fragment
			// 第一种Fragment情况
			// <>
			// 	<div></div>
			// 	<div></div>
			// </>
			// 对应DOM
			// <div></div>
			// <div></div>
			// jsx
			// jsxs(Fragment, {
			// 	children: [
			// 		jsx("div", {}),
			// 		jsx("div", {})
			// 	]
			// })
			// 这时候newChild是数组
			newChild = newChild?.props.children;
		}

		// 判断当前fiber的类型
		if (typeof newChild === 'object' && newChild !== null) {
			// 多节点的情况 ul > li*3
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

		// 兜底删除
		if (currentFiber !== null) {
			// 这里不应该只删除一个child，而是删除所有的没有用到的同级的节点
			deleteRemainingChildren(returnFiber, currentFiber);
		}

		if (__DEV__) {
			console.warn('未实现的reconcile类型', newChild);
		}

		return null;
	};
}

export const reconcileChildFibers = ChildReconciler(true); // 需要追踪更新
export const mountChildFibers = ChildReconciler(false); // 不需要追踪更新，构建一颗离屏dom树，优化策略，对我们的根节点执行一次placement，直接将离屏dom树插入页面
