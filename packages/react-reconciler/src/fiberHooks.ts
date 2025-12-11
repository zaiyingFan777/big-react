// FunctionComponent相关代码

import { FiberNode } from './fiber';

export function renderWithHooks(wip: FiberNode) {
	// {
	// 	$$typeof: Symbol.for("react.element"),
	// 	type: App,        // 指向组件函数或类
	// 	props: { prop: "value" },
	// 	key: null,
	// 	ref: null
	// }
	// 拿到函数组件的函数
	const Component = wip.type;
	const props = wip.pendingProps;
	// 执行函数就是函数组件返回的Children
	const children = Component(props);

	return children;
}
