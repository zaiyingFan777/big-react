import { FiberNode } from 'react-reconciler/src/fiber';
import { HostText } from 'react-reconciler/src/workTags';
import { updateFiberProps } from './SyntheticEvent';
import { Props } from 'shared/ReactTypes';
import { DOMElement } from './SyntheticEvent';

export type Container = Element;
export type Instance = Element;
export type TextInstance = Text;

export const createInstance = (type: string, props: Props): Instance => {
	// todo 处理props
	const element = document.createElement(type) as unknown;
	// 将事件回调保存在DOM中，通过以下两个时机对接：1.创建dom时，2.更新属性时
	// 这里是创建dom
	updateFiberProps(element as DOMElement, props);
	return element as DOMElement;
};

export const createTextInstance = (content: string) => {
	return document.createTextNode(content);
};

export const appendInitialChild = (
	parent: Instance | Container,
	child: Instance
) => {
	parent.appendChild(child);
};

export const appendChildToContainer = appendInitialChild;

// 在某个节点之前插入
export function insertChildToContainer(
	child: Instance,
	container: Container,
	before: Instance
) {
	container.insertBefore(child, before);
}

// commitWork中的提交更新的函数
export function commitUpdate(fiber: FiberNode) {
	switch (fiber.tag) {
		case HostText:
			const text = fiber.memoizedProps.content;
			return commitTextUpdate(fiber.stateNode, text);
		// case HostComponent: 这里可以判断dom的属性比如className、style是否变化去更新dom，通过fiberNode的updateQueue属性(见completeWork.ts)
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

export function removeChild(
	child: Instance | TextInstance,
	container: Container
) {
	container.removeChild(child);
}
