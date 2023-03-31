// React
import currentDispatcher, {
	Dispatcher,
	resolveDispatcher
} from './src/currentDispatcher';
import ReactCurrentBatchConfig from './src/currentBatchConfig';
import {
	createElement as createElementFn,
	isValidElement as isValidElementFn
} from './src/jsx'; // 报错 [!] RollupError: Could not resolve "./src/jsx" from "packages/react/index.ts"

// 当前使用的hooks的集合
// 提供hooks接口，react中提供的hooks其实是内部调用了dispatcher对应的hooks的实现，mount、update、hooks上下文（这些在react-reconciler包中具体实现）中的hooks具体实现不一样
export const useState: Dispatcher['useState'] = (initialState) => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useState(initialState);
};

export const useEffect: Dispatcher['useEffect'] = (create, deps) => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useEffect(create, deps);
};

export const useTransition: Dispatcher['useTransition'] = () => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useTransition();
};

// hooks所在的内部数据共享层
// 内部数据共享层
export const __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = {
	currentDispatcher,
	ReactCurrentBatchConfig
};

export const version = '0.0.0';
// 这里应该根据环境区分jsx/jsxDEV，在测试用例中也要区分，当前ReactElement-test.js中使用的是jsx
// export const createElement = jsxDEV;
export const createElement = createElementFn;
export const isValidElement = isValidElementFn;

// export default {
// 	version: '0.0.0',
// 	createElement: jsxDEV
// };
