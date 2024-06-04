import { FiberNode } from 'react-reconciler/src/fiber';
import { HostComponent, HostText } from 'react-reconciler/src/workTags';
import { Props } from 'shared/ReactTypes';
import { DOMElement, updateFiberProps } from './SyntheticEvent';

export type Container = Element;
export type Instance = Element;
export type TextInstance = Text;

// 创建要被插入DOM
export const createInstance = (type: string, props: Props): Instance => {
	// todo 处理props

	// document.createElement('div')
	const element = document.createElement(type) as unknown;
	// 创建dom时，将事件保存在dom上的elementPropsKey属性上
	updateFiberProps(element as DOMElement, props);
	return element as DOMElement;
};

// 插入孩子节点
export const appendInitialChild = (
	parent: Instance | Container,
	child: Instance
) => {
	// appendChild 方法用于将一个节点（child）添加到另一个节点（parent）的子节点列表中。在DOM（文档对象模型）操作中，
	// 当你调用 parent.appendChild(child)，child 节点会被插入到 parent 节点的子节点列表的末尾。
	// 这意味着如果 parent 节点已经包含子节点，那么 child 节点将作为最后一个子节点被添加。如果 parent 节点没有子节点，child 将成为它的第一个子节点。
	parent.appendChild(child);
};

// 创建文本dom
export const createTextInstance = (content: string) => {
	return document.createTextNode(content);
};

// 将元素插到父节点
export const appendChildToContainer = appendInitialChild;

// commit阶段的更新操作
export function commitUpdate(fiber: FiberNode) {
	switch (fiber.tag) {
		case HostText:
			const text = fiber.memoizedProps?.content;
			return commitTextUpdate(fiber.stateNode, text);

		default:
			if (__DEV__) {
				console.warn('未实现的Update类型', fiber);
			}
			break;
	}
}

export function commitTextUpdate(textInstance: TextInstance, content: string) {
	textInstance.textContent = content;
}

// commit中的移除节点
export function removeChild(
	child: Instance | TextInstance,
	container: Container
) {
	// removeChild 是一个 DOM（文档对象模型）操作，它用于从 DOM 树中移除一个子节点。这个操作定义在 Node 接口中，
	// 因此不仅限于 Element 类型，任何继承自 Node 的对象都可以调用 removeChild 方法。
	container.removeChild(child);
}
