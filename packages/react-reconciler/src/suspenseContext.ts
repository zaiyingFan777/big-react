import { FiberNode } from './fiber';

// 用栈保存suspense，栈元素都是suspense
const suspenseHandlerStack: FiberNode[] = [];

export function getSuspenseHandler() {
	// 返回栈顶的第一个
	return suspenseHandlerStack[suspenseHandlerStack.length - 1];
}

// 入栈
export function pushSuspenseHandler(handler: FiberNode) {
	suspenseHandlerStack.push(handler);
}

// 出栈
export function popSuspenseHandler() {
	suspenseHandlerStack.pop();
}
