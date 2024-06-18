// React
import currentDispatcher, {
	Dispatcher,
	resolveDispatcher
} from './src/currentDispatcher';
import { jsx, jsxDEV, isValidElement as isValidElementFn } from './src/jsx';
// react 导出Fragment
export { REACT_FRAGMENT_TYPE as Fragment } from 'shared/ReactSymbols';
export const useState: Dispatcher['useState'] = (initialState) => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useState(initialState); // 得到[num, setNum]
};

export const useEffect: Dispatcher['useEffect'] = (create, deps) => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useEffect(create, deps);
};

// 内部数据共享层
export const __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = {
	currentDispatcher
};

export const version = '0.0.0';
// 根据环境使用jsx还是jsxDEV  生产环境用jsx，开发环境用jsxDEV
// export const createElement = jsxDEV;
export const createElement = jsx;
export const isValidElement = isValidElementFn;
