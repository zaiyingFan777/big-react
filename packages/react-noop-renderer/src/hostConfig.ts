import { FiberNode } from 'react-reconciler/src/fiber';
import { HostText } from 'react-reconciler/src/workTags';
import { Props } from 'shared/ReactTypes';

// hostRoot
export interface Container {
	rootID: number;
	children: (Instance | TextInstance)[];
}
// hostComponent
export interface Instance {
	id: number;
	type: string;
	children: (Instance | TextInstance)[];
	parent: number; // 父元素的id
	props: Props;
}
// hostText
export interface TextInstance {
	text: string;
	id: number;
	parent: number;
}

let instanceCounter = 0;

// 创建要被插入DOM
export const createInstance = (type: string, props: Props): Instance => {
	const instance = {
		id: instanceCounter++,
		type: type,
		children: [],
		parent: -1,
		props
	};
	return instance;
};

// 插入孩子节点到Parent末尾
export const appendInitialChild = (
	parent: Instance | Container,
	child: Instance
) => {
	// child之前父节点id
	const prevParentID = child.parent;
	const parentID = 'rootID' in parent ? parent.rootID : parent.id;

	// prevParentID !== -1代表他已经被插入到其他Parent下了
	if (prevParentID !== -1 && prevParentID !== parentID) {
		throw new Error('不能重复挂载child');
	}
	child.parent = parentID;
	parent.children.push(child);
};

// 创建文本dom
export const createTextInstance = (content: string) => {
	const instance = {
		text: content,
		id: instanceCounter++,
		parent: -1
	};
	return instance;
};

// 将元素插到父节点
export const appendChildToContainer = (parent: Container, child: Instance) => {
	// child之前父节点id
	const prevParentID = child.parent;

	// prevParentID !== -1代表他已经被插入到其他Parent下了
	if (prevParentID !== -1 && prevParentID !== parent.rootID) {
		throw new Error('不能重复挂载child');
	}
	child.parent = parent.rootID;
	parent.children.push(child);
};

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
	textInstance.text = content;
}

// commit中的移除节点
export function removeChild(
	child: Instance | TextInstance,
	container: Container
) {
	// 找到要被删除元素的下标
	const index = container.children.indexOf(child);

	if (index === -1) {
		throw new Error('child不存在');
	}
	container.children.splice(index, 1);
}

// insertBefore
export function insertChildToContainer(
	child: Instance,
	container: Container,
	before: Instance
) {
	// 找到before的下标
	const beforeIndex = container.children.indexOf(before);
	if (beforeIndex === -1) {
		throw new Error('before不存在');
	}
	const index = container.children.indexOf(child);
	if (index !== -1) {
		// 如果child已经存在container之中了，我们先移除index再插入到beforeIndex之前
		container.children.splice(index, 1);
	}
	container.children.splice(beforeIndex, 0, child);
}

export const scheduleMicroTask =
	typeof queueMicrotask === 'function'
		? queueMicrotask
		: typeof Promise === 'function'
		? (callback: (...args: any) => void) => Promise.resolve(null).then(callback)
		: setTimeout;
