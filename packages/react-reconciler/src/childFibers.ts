// 生成子节点以及标记flags的过程
import { ReactElementType } from 'shared/ReactTypes';
import { FiberNode, createFiberFromElement } from './fiber';
import { REACT_ELEMENT_TYPE } from 'shared/ReactSymbols';
import { HostText } from './workTags';
import { Placement } from './fiberFlags';

function ChildReconciler(shouldTrackEffects: boolean) {
	function reconcileSingleElement(
		returnFiber: FiberNode,
		currentFiber: FiberNode | null,
		element: ReactElementType
	) {
		// 根据element创建fiber
		const fiber = createFiberFromElement(element);
		fiber.return = returnFiber;
		return fiber;
	}

	// 文本
	function reconcileSingleTextNode(
		returnFiber: FiberNode,
		currentFiber: FiberNode | null,
		content: string | number
	) {
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

		if (__DEV__) {
			console.warn('未实现的reconcile类型', newChild);
		}

		return null;
	};
}

export const reconcileChildFibers = ChildReconciler(true); // 需要追踪更新
export const mountChildFibers = ChildReconciler(false); // 不需要追踪更新，构建一颗离屏dom树，优化策略，对我们的根节点执行一次placement，直接将离屏dom树插入页面
