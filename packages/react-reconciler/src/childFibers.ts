import { ReactElementType } from 'shared/ReactTypes';
import { createFiberFromElement, FiberNode } from './fiber';
import { REACT_ELEMENT_TYPE } from 'shared/ReactSymbols';
import { HostText } from './workTags';
import { Placement } from './fiberFlags';

// shouldTrackEffects: true跟踪副作用，false不跟踪副作用
function ChildReconciler(shouldTrackEffects: boolean) {
	// 单子节点diff，根据element创建fiber
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

	// 单子节点diff，根据element创建fiber
	function reconcileSingleTextNode(
		returnFiber: FiberNode,
		currentFiber: FiberNode | null,
		content: string | number
	) {
		// 根据element创建fiber
		// 文本fiebr的pendingProps保存的是{content}来保存文本内容
		const fiber = new FiberNode(HostText, { content }, null);
		fiber.return = returnFiber;
		return fiber;
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
