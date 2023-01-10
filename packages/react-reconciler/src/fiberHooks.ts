import { FiberNode } from './fiber';

export function renderWithHooks(wip: FiberNode) {
	// 对于函数组件，函数组件保存在了type上
	const Component = wip.type;
	// 获取props
	const props = wip.pendingProps;
	// 获取children，函数执行结果
	const children = Component(props);

	return children;
}
