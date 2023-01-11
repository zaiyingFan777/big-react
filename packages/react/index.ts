// React
import currentDispatcher, {
	Dispatcher,
	resolveDispatcher
} from './src/currentDispatcher';
import { jsxDEV } from './src/jsx'; // 报错 [!] RollupError: Could not resolve "./src/jsx" from "packages/react/index.ts"

// 当前使用的hooks的集合
// 提供hooks接口，react中提供的hooks其实是内部调用了dispatcher对应的hooks的实现，mount、update、hooks上下文（这些在react-reconciler包中具体实现）中的hooks具体实现不一样
export const useState: Dispatcher['useState'] = (initialState) => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useState(initialState);
};

// hooks所在的内部数据共享层
// 内部数据共享层
export const __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = {
	currentDispatcher
};

export default {
	version: '0.0.0',
	createElement: jsxDEV
};
