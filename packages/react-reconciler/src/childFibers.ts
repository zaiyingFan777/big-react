// 生成子节点以及标记flags的过程
import { Props, ReactElementType } from 'shared/ReactTypes';
import {
	FiberNode,
	createFiberFromElement,
	createWorkInProgress
} from './fiber';
import { REACT_ELEMENT_TYPE } from 'shared/ReactSymbols';
import { HostText } from './workTags';
import { ChildDeletion, Placement } from './fiberFlags';

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

	function reconcileSingleElement(
		returnFiber: FiberNode,
		currentFiber: FiberNode | null,
		element: ReactElementType
	) {
		const key = element.key;
		// key type相同才能复用
		work: if (currentFiber !== null) {
			// update
			if (currentFiber.key === key) {
				// key相同，比较type
				if (element.$$typeof === REACT_ELEMENT_TYPE) {
					if (currentFiber.type === element.type) {
						// key相同、type也相同，复用
						const existing = useFiber(currentFiber, element.props);
						existing.return = returnFiber;
						return existing;
					}
					// type不同
					// 删除旧的
					deleteChild(returnFiber, currentFiber);
					// 下面再重新创建新的fiber
					break work;
				} else {
					if (__DEV__) {
						console.warn('还未实现的react类型', element);
						break work;
					}
				}
			} else {
				// 删掉旧的
				deleteChild(returnFiber, currentFiber);
			}
		}
		// 创建新的
		// 根据element创建fiber
		const fiber = createFiberFromElement(element);
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
		if (currentFiber !== null) {
			// update
			if (currentFiber.tag === HostText) {
				// 类型type没变，可以复用
				const existing = useFiber(currentFiber, { content });
				existing.return = returnFiber;
				return existing;
			}
			// tag变了 <div>(hostComponent) => hahah(HostText)
			// 先删除之前的fiber
			deleteChild(returnFiber, currentFiber);
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

	// shouldTrackEffects 是否追踪副作用 true为追踪，false为不追踪 就不用标记flags
	return function reconcileChildFibers(
		returnFiber: FiberNode,
		currentFiber: FiberNode | null,
		newChild?: ReactElementType
	) {
		// 判断当前fiber的类型
		if (typeof newChild === 'object' && newChild !== null) {
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
		// TODO 多节点的情况 ul > li*3

		// HostText
		if (typeof newChild === 'string' || typeof newChild === 'number') {
			return placeSingleChild(
				reconcileSingleTextNode(returnFiber, currentFiber, newChild)
			);
		}

		// 兜底删除
		if (currentFiber !== null) {
			deleteChild(returnFiber, currentFiber);
		}

		if (__DEV__) {
			console.warn('未实现的reconcile类型', newChild);
		}

		return null;
	};
}

export const reconcileChildFibers = ChildReconciler(true); // 需要追踪更新
export const mountChildFibers = ChildReconciler(false); // 不需要追踪更新，构建一颗离屏dom树，优化策略，对我们的根节点执行一次placement，直接将离屏dom树插入页面
