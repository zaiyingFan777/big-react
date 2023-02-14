import { FiberNode } from 'react-reconciler/src/fiber';
import { HostText } from 'react-reconciler/src/workTags';
import { Props } from 'shared/ReactTypes';

export interface Container {
	rootID: number; // hostRoot的id
	children: (Instance | TextInstance)[];
}

export interface Instance {
	id: number;
	type: string;
	children: (Instance | TextInstance)[];
	parent: number; // 父节点的id
	props: Props;
}

export interface TextInstance {
	text: string;
	id: number;
	parent: number;
}

let instanceCounter = 0;

export const createInstance = (type: string, props: Props): Instance => {
	const instance = {
		id: instanceCounter++,
		type,
		children: [],
		parent: -1,
		props
	};

	return instance;
};

export const createTextInstance = (content: string) => {
	const instance = {
		text: content,
		id: instanceCounter++,
		parent: -1
	};
	return instance;
};

export const appendInitialChild = (
	parent: Instance | Container,
	child: Instance
) => {
	// 找到parent id
	const prevParentID = child.parent;
	// 要被插入的父元素的id
	const parentID = 'rootID' in parent ? parent.rootID : parent.id; // 如果rootID在parent中代表，parent为Container，不在则是Instance

	if (prevParentID !== -1 && prevParentID !== parentID) {
		// 要append到parent的child之前已经有parent了，并且之前插入的父元素不是当前要被插入的父元素(重复的插入操作)
		throw new Error('不能重复挂载child');
	}
	// 执行插入操作
	child.parent = parentID;
	parent.children.push(child);
};

export const appendChildToContainer = (parent: Container, child: Instance) => {
	// 找到parent id
	const prevParentID = child.parent;

	if (prevParentID !== -1 && prevParentID !== parent.rootID) {
		// 要append到parent的child之前已经有parent了，并且之前插入的父元素不是当前要被插入的父元素(重复的插入操作)
		throw new Error('不能重复挂载child');
	}
	// 执行插入操作
	child.parent = parent.rootID;
	parent.children.push(child);
};

// 在某个节点之前插入
export function insertChildToContainer(
	child: Instance,
	container: Container,
	before: Instance
) {
	const beforeIndex = container.children.indexOf(before);
	if (beforeIndex === -1) {
		throw new Error('before不存在');
	}
	const index = container.children.indexOf(child);
	if (index !== -1) {
		// child已经在container之中了
		// 将child放在before之前
		// 先移除，在插入到before之前
		// 移除
		container.children.splice(index, 1);
	}
	// 插入
	// var a = [1,2,3]; a.splice(1, 0, 'x'); => [1, 'x', 2, 3]
	container.children.splice(beforeIndex, 0, child);
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
	textInstance.text = content;
}

export function removeChild(
	child: Instance | TextInstance,
	container: Container
) {
	const index = container.children.indexOf(child);

	if (index === -1) {
		throw new Error('child不存在');
	}
	// 移除child
	container.children.splice(index, 1);
}

// 调度微任务
export const scheduleMicroTask =
	typeof queueMicrotask === 'function'
		? queueMicrotask
		: typeof Promise === 'function'
		? (callback: (...arg: any) => void) => Promise.resolve(null).then(callback) // 传进来的回调函数在promise的then中执行
		: setTimeout;
