import { Key, Props, ReactElementType } from 'shared/ReactTypes';
import {
	createFiberFromElement,
	createFiberFromFragment,
	createWorkInProgress,
	FiberNode
} from './fiber';
import { REACT_ELEMENT_TYPE, REACT_FRAGMENT_TYPE } from 'shared/ReactSymbols';
import { Fragment, HostText } from './workTags';
import { ChildDeletion, Placement } from './fiberFlags';

type ExistingChildren = Map<string | number, FiberNode>;

// shouldTrackEffects: true跟踪副作用，false不跟踪副作用
function ChildReconciler(shouldTrackEffects: boolean) {
	// 删除子节点 childToDelete要被删除的子节点
	function deleteChild(returnFiber: FiberNode, childToDelete: FiberNode) {
		if (!shouldTrackEffects) {
			// 不需要追踪副作用
			return;
		}
		// 需要追踪副作用，需要被删除的子节点集合，保存在returnFiber（父节点）上
		const deletions = returnFiber.deletions;
		if (deletions === null) {
			// 当前父fiber下还没有要被删除的子节点
			returnFiber.deletions = [childToDelete];
			returnFiber.flags |= ChildDeletion;
		} else {
			deletions.push(childToDelete);
		}
	}

	// 遍历删除currentFirstChild以及他的兄弟节点
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

	// 单子节点diff，根据element创建fiber
	function reconcileSingleElement(
		returnFiber: FiberNode,
		currentFiber: FiberNode | null,
		element: ReactElementType
	) {
		const key = element.key;
		while (currentFiber !== null) {
			// update
			// 比较key，如果key不同不能复用 A1->A2
			// 比较type(key相同)，如果type不同不能复用 A1B2C3->B1(AB为type,12为key)  A1B2C3都不能复用 删除，因为key为1的type不同，那后面key不同的更不能复用
			// 如果key与type都相同，则可复用 A1B2C3->A1  A1复用、B2C3删除
			// 先比较key，
			if (currentFiber.key === key) {
				// key相同
				if (element.$$typeof === REACT_ELEMENT_TYPE) {
					// key相同再去比较type
					if (currentFiber.type === element.type) {
						// fragment嵌套，见note.md
						let props = element.props;
						if (element.type === REACT_FRAGMENT_TYPE) {
							props = element.props.children;
						}
						// type相同
						// 可以复用
						// TODO mount完毕后，第一次更新useFiber的时候是复用还是新建，需要尝试一下
						const existing = useFiber(currentFiber, props);
						existing.return = returnFiber;
						// key相同、type相同，当前节点可以复用，后面节点标记删除
						// A1B2C3->A1  A1复用、B2C3删除
						deleteRemainingChildren(returnFiber, currentFiber.sibling);
						return existing;
					}
					// key相同、type不同，删除所有旧的
					// A1B2C3->B1(AB为type,12为key)  A1B2C3都不能复用
					// 下面创建新的fiber
					deleteRemainingChildren(returnFiber, currentFiber);
					break;
				} else {
					if (__DEV__) {
						console.warn('还未实现的react类型', element);
						break;
					}
				}
			} else {
				// key不同,删除当前key不同的
				deleteChild(returnFiber, currentFiber);
				// 再遍历当前节点的兄弟节点，看是否有复用的 A1B2C3->D3
				// 如果遍历完都没有找到可以复用的，则走下面的创建流程
				currentFiber = currentFiber.sibling;
			}
		}

		// 创建新的（同mount流程）
		// 根据element创建fiber
		let fiber;
		if (element.type === REACT_FRAGMENT_TYPE) {
			// 创建fragment的fiber  他的pendingProps不像其他的{children:xx}他就直接{$$typeof...}或者一个数组[reactElement, ...]没有children作为连接
			fiber = createFiberFromFragment(element.props.children, key);
		} else {
			fiber = createFiberFromElement(element);
		}
		fiber.return = returnFiber;
		return fiber;
	}

	// 单子节点diff，根据element创建fiber
	function reconcileSingleTextNode(
		returnFiber: FiberNode,
		currentFiber: FiberNode | null,
		content: string | number
	) {
		while (currentFiber !== null) {
			// update
			if (currentFiber.tag === HostText) {
				// type(类型)没有变，可以复用
				const existing = useFiber(currentFiber, { content });
				existing.return = returnFiber;
				deleteRemainingChildren(returnFiber, currentFiber.sibling);
				return existing;
			}
			// 之前可能是HostComponent现在变为了HostText
			// <div> => haha
			// 删除div
			deleteChild(returnFiber, currentFiber);
			// 然后下面再创建新的HostText(hahah)

			// 当前节点不能复用，遍历兄弟节点
			currentFiber = currentFiber.sibling;
		}
		// 都不能复用，创建新的fiber
		// 根据element创建fiber
		// 文本fiebr的pendingProps保存的是{content}来保存文本内容
		const fiber = new FiberNode(HostText, { content }, null);
		fiber.return = returnFiber;
		return fiber;
	}

	// key、type相同，复用
	function useFiber(fiber: FiberNode, pendingProps: Props): FiberNode {
		// 对于同一个fiberNode，即使反复更新，current、wip这两个fiberNode会重复使用
		// 不会再创造新的fiberNode
		const clone = createWorkInProgress(fiber, pendingProps);
		clone.index = 0;
		clone.sibling = null;
		return clone;
	}

	// fiber: wip
	// 打标记的函数
	function placeSingleChild(fiber: FiberNode) {
		if (shouldTrackEffects && fiber.alternate === null) {
			// 首屏渲染
			fiber.flags |= Placement;
		}
		return fiber;
	}

	// 多节点diff
	function reconcileChildrenArray(
		returnFiber: FiberNode,
		currentFirstFiber: FiberNode | null,
		newChild: any[]
	) {
		// element(newChild[i])中遍历到的最后一个可复用的元素在current中的Index
		let lastPlacedIndex: number = 0;
		// 创建的最后一个fiber(updateFromMap的返回值)
		let lastNewFiber: FiberNode | null = null;
		// 创建的第一个fiebr，最后也会返回这个
		let firstNewFiber: FiberNode | null = null;

		// 整体流程分为4步。
		// 1.将current中所有同级fiber保存在Map中
		const existingChildren: ExistingChildren = new Map();
		// current为当前的fibernode，单向链表，a1b2c3
		// newChild为数组[ReactElement, ReactElement, ReactElement]
		let current = currentFirstFiber;
		while (current !== null) {
			const keyToUse = current.key !== null ? current.key : current.index;
			existingChildren.set(keyToUse, current);
			current = current.sibling;
		}

		for (let i = 0; i < newChild.length; i++) {
			// 2.遍历newChild数组(寻找是否可复用)，对于每个遍历到的element，存在两种情况：
			const after = newChild[i];
			// 2.1在Map中存在对应current fiber，且可以复用
			// 2.2在Map中不存在对应current fiber，或不能复用
			const newFiber = updateFromMap(returnFiber, existingChildren, i, after);
			// 更新前xxx 更新后为false null
			if (newFiber === null) {
				// 继续遍历
				continue;
			}

			// 3.判断是插入还是移动
			// 移动：向右移动,
			// 移动的判断依据：element的index与「element对应current fiber」的index的比较
			// A1 B2 C3 -> B2 C3 A1
			// 0__1__2______0__1__2
			// 当遍历element时，「当前遍历到的element」一定是「所有已遍历的element」中最靠右那个。比如C3,肯定是已经遍历的最后一个前面遍历了B2 C3,C3就是已经遍历的最后一个
			// 所以只需要记录「最后一个可复用fiber」在current中的index（lastPlacedIndex），在接下来的遍历中：
			// 如果接下来遍历到的「可复用fiber」的index < lastPlacedIndex，则标记Placement
			// 否则，不标记
			// element遍历: 1.B2，在current中找到可复用的B2的index为1，1> 0,lastPlacedIndex为1，
			// 2.C3，在current中找到了可复用的C3的index为2，用2和lastPlacedIndex(1)比较，2>1，不标记移动，重新赋值lastPlacedIndex为2
			// 3.A1，在current中找到了可复用的A1的index为0，用0和lastPlacedIndex(2)比较，0<2，标记移动，不需要重新赋值lastPlacedIndex(更新前a1为0，更新后a1为2，变为了最后一个，肯定得需要移动)
			// A1标记移动
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
					// 不移动 更新lastPlacedIndex
					lastPlacedIndex = oldIndex;
				}
			} else {
				// mount 插入
				newFiber.flags |= Placement;
			}
		}

		// 4.最后Map中剩下的都标记删除
		existingChildren.forEach((fiber) => {
			deleteChild(returnFiber, fiber);
		});

		// 返回我们创建的第一个新fiber
		return firstNewFiber;
	}

	// elements为fragment的children
	function updateFragment(
		returnFiber: FiberNode,
		current: FiberNode | undefined,
		elements: any[],
		key: Key,
		existingChildren: ExistingChildren
	) {
		let fiber;
		if (!current || current.tag !== Fragment) {
			// 创建新的fragment fiber
			fiber = createFiberFromFragment(elements, key);
		} else {
			// current存在，且更新前后都是fragment 复用
			existingChildren.delete(key);
			fiber = useFiber(current, elements);
		}
		fiber.return = returnFiber;
		return fiber;
	}

	// 多节点diff，判断是否可以复用，返回复用的fiber或者新建的fiber
	// element: 新的reactElement
	function updateFromMap(
		returnFiber: FiberNode,
		existingChildren: ExistingChildren,
		index: number,
		element: any
	): FiberNode | null {
		// 有Key用key，无key用索引
		// const keyToUse = element.key !== null ? element.key : element.index;
		const keyToUse = getElementKeyToUse(element, index);
		// 在existingChildren找到current fiber
		const before = existingChildren.get(keyToUse);

		// 如果element是hostText，current fiber是什么
		if (typeof element === 'string' || typeof element === 'number') {
			// <div><span>111</span></div>
			// /*#__PURE__*/_jsx("div", {
			// 	children: /*#__PURE__*/_jsx("span", {
			// 		children: "111"
			// 	})
			// });
			// hostText
			if (before) {
				if (before.tag === HostText) {
					// 更新前是hostText
					// 在map中删除currentfiber，因为可以复用
					existingChildren.delete(keyToUse);
					return useFiber(before, { content: element + '' });
				}
			}
			// 不能复用，创建新的
			return new FiberNode(HostText, { content: element + '' }, null);
		}

		// ReactElement
		// element是其他ReactElement类型
		if (typeof element === 'object' && element !== null) {
			switch (element.$$typeof) {
				case REACT_ELEMENT_TYPE:
					// 处理fragment
					if (element.type === REACT_FRAGMENT_TYPE) {
						// 见note.md 多节点
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
							// key相同、type也相同，可以复用
							existingChildren.delete(keyToUse);
							return useFiber(before, element.props);
						}
					}
					// current中没有找到对应key的fiebr，创建一个FiberNode
					return createFiberFromElement(element);
			}

			// 数组
			// <ul>
			// 	<li>1</li>
			// 	<li>1</li>
			// 	{
			// 		[
			// 			<li>3</li>
			// 			<li>4</li>
			// 		]
			// 	}
			// </ul>
			// 这种情况element进来是个数组[l3、l4]
			// todo数组类型
			if (Array.isArray(element) && __DEV__) {
				console.warn('还未实现的数组类型的child');
			}
		}

		// 见note.md 8.5把数组当成fragment来处理
		// 我们当作数组来处理
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

	// returnFiber父亲fiber(wip)
	// currentFiber当前子节点的fiber(current.child)
	// newChild 子节点的ReactElement
	return function reconcileChildFibers(
		returnFiber: FiberNode,
		currentFiber: FiberNode | null,
		newChild?: any
	) {
		// 判断fragment
		const isUnkeyedTopLevelFragment =
			typeof newChild === 'object' &&
			newChild !== null &&
			newChild.type === REACT_FRAGMENT_TYPE &&
			newChild.key === null;
		if (isUnkeyedTopLevelFragment) {
			// 把数组赋值给newChild
			// jsx
			// <>
			// 	<div></div>
			// 	<div></div>
			// </>
			// jsxs(Fragment, {
			// 	children: [
			// 			jsx("div", {}),
			// 			jsx("div", {})
			// 	]
			// });
			// 上面这种情况，newChild变为数组后，会进入我们下面多节点diff数组的逻辑
			newChild = newChild.props.children;

			// ps:
			// <>
			// 	<span>111</span>
			// </>
			// /*#__PURE__*/_jsx(_Fragment, {
			// 	children: /*#__PURE__*/_jsx("span", {
			// 		children: "111"
			// 	})
			// });
			// 这种情况就是单节点的diff因为newChild.props.children不是数组
		}
		// 单子节点reactelement: props: {children: {}}
		// 多子节点reactelement: props: {children: [{},{},{}]}
		// 判断当前fiber的类型
		if (typeof newChild === 'object' && newChild !== null) {
			// 多节点的情况 ul > li*3
			if (Array.isArray(newChild)) {
				// 多节点diff
				return reconcileChildrenArray(returnFiber, currentFiber, newChild);
			}

			// 单节点的newChild是ReactElement，多节点的newChild是ReactElement数组
			switch (newChild.$$typeof) {
				// ps: 单节点、多节点diff是指更新后是单节点还是多节点
				case REACT_ELEMENT_TYPE:
					// ReactElement
					// 单节点diff
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
			// 兜底操作
			deleteRemainingChildren(returnFiber, currentFiber);
		}

		if (__DEV__) {
			console.warn('未实现的reconcile类型', newChild);
		}
		return null;
	};
}

// 追踪
export const reconcileChildFibers = ChildReconciler(true);
// 不追踪
export const mountChildFibers = ChildReconciler(false);
