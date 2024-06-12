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

// insertBefore
export function insertChildToContainer(
	child: Instance,
	container: Container,
	before: Instance
) {
	container.insertBefore(child, before);
}

// (callback: (...args: any) => void) => Promise.resolve(null).then(callback)
// Promise.resolve(null)：这个箭头函数返回一个Promise对象。Promise.resolve(null)是一个静态方法，它创建一个已经解决（fulfilled）的Promise，其结果值为null。
// .then(callback)：这是Promise对象的then方法，它接受一个函数作为参数，这个函数将在Promise解决时被调用。在这个例子中，传入的回调函数callback将在Promise解决后执行。
// 整体来看，这段代码意思：创建一个已经解决的Promise对象，然后使用.then方法注册一个回调函数，当Promise解决时，执行这个回调函数。
// 这种模式通常用于将传统的回调函数模式转换为基于Promise的异步模式
/**
 * function test() {
 *   console.log('2222')
 * }
 * const test2 = (callback) => Promise.resolve(null).then(callback);
 * test2(test);
 * console.log('1111')
 *
 * 打印：1111 2222
 */

export const scheduleMicroTask =
	typeof queueMicrotask === 'function'
		? queueMicrotask
		: typeof Promise === 'function'
		? (callback: (...args: any) => void) => Promise.resolve(null).then(callback)
		: setTimeout;
