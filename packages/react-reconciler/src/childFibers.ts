import { Props, ReactElementType } from 'shared/ReactTypes';
import {
	createFiberFromElement,
	createWorkInProgress,
	FiberNode
} from './fiber';
import { REACT_ELEMENT_TYPE } from 'shared/ReactSymbols';
import { HostText } from './workTags';
import { ChildDeletion, Placement } from './fiberFlags';

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

	// 单子节点diff，根据element创建fiber
	function reconcileSingleElement(
		returnFiber: FiberNode,
		currentFiber: FiberNode | null,
		element: ReactElementType
	) {
		const key = element.key;
		work: if (currentFiber !== null) {
			// update
			// 比较key，如果key不同不能复用
			// 比较type，如果type不同不能复用
			// 如果key与type都相同，则可复用
			// 先比较key，
			if (currentFiber.key === key) {
				// key相同
				if (element.$$typeof === REACT_ELEMENT_TYPE) {
					// key相同再去比较type
					if (currentFiber.type === element.type) {
						// type相同
						// 可以复用
						// TODO mount完毕后，第一次更新useFiber的时候是复用还是新建，需要尝试一下
						const existing = useFiber(currentFiber, element.props);
						existing.return = returnFiber;
						return existing;
					}
					// key相同、type不同，删除旧的
					// 下面创建新的fiber
					deleteChild(returnFiber, currentFiber);
					break work;
				} else {
					if (__DEV__) {
						console.warn('还未实现的react类型', element);
						break work;
					}
				}
			} else {
				// 删除旧的，
				deleteChild(returnFiber, currentFiber);
			}
		}

		// 创建新的（同mount流程）
		// 根据element创建fiber
		const fiber = createFiberFromElement(element);
		fiber.return = returnFiber;
		return fiber;
	}

	// 单子节点diff，根据element创建fiber
	function reconcileSingleTextNode(
		returnFiber: FiberNode,
		currentFiber: FiberNode | null,
		content: string | number
	) {
		if (currentFiber !== null) {
			// update
			if (currentFiber.tag === HostText) {
				// type(类型)没有变，可以复用
				const existing = useFiber(currentFiber, { content });
				existing.return = returnFiber;
				return existing;
			}
			// 之前可能是HostComponent现在变为了HostText
			// <div> => haha
			// 删除div
			deleteChild(returnFiber, currentFiber);
			// 然后下面再创建新的HostText(hahah)
		}
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

	// returnFiber父亲fiber(wip)
	// currentFiber当前子节点的fiber(current.child)
	// newChild 子节点的ReactElement
	return function reconcileChildFibers(
		returnFiber: FiberNode,
		currentFiber: FiberNode | null,
		newChild?: ReactElementType
	) {
		// 单子节点reactelement: props: {children: {}}
		// 多子节点reactelement: props: {children: [{},{},{}]}
		// 判断当前fiber的类型
		if (typeof newChild === 'object' && newChild !== null) {
			switch (newChild.$$typeof) {
				case REACT_ELEMENT_TYPE:
					// ReactElement
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
		// TODO 多节点的情况 ul > li*3

		// HostText
		if (typeof newChild === 'string' || typeof newChild === 'number') {
			return placeSingleChild(
				reconcileSingleTextNode(returnFiber, currentFiber, newChild)
			);
		}

		if (currentFiber !== null) {
			// 兜底操作
			deleteChild(returnFiber, currentFiber);
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
