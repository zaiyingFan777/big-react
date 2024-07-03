// React
import currentDispatcher, {
	Dispatcher,
	resolveDispatcher
} from './src/currentDispatcher';
import currentBatchConfig from './src/currentBatchConfig';
import { jsx, jsxDEV, isValidElement as isValidElementFn } from './src/jsx';
// react 导出Fragment
export { REACT_FRAGMENT_TYPE as Fragment } from 'shared/ReactSymbols';
// react导出 createContext
export { createContext } from './src/context';
export const useState: Dispatcher['useState'] = (initialState) => {
	const dispatcher = resolveDispatcher() as Dispatcher;
	return dispatcher.useState(initialState); // 得到[num, setNum]
};

export const useEffect: Dispatcher['useEffect'] = (create, deps) => {
	const dispatcher = resolveDispatcher() as Dispatcher;
	return dispatcher.useEffect(create, deps);
};

export const useTransition: Dispatcher['useTransition'] = () => {
	const dispatcher = resolveDispatcher() as Dispatcher;
	return dispatcher.useTransition();
};

export const useRef: Dispatcher['useRef'] = (initialValue) => {
	const dispatcher = resolveDispatcher() as Dispatcher;
	return dispatcher.useRef(initialValue);
};

export const useContext: Dispatcher['useContext'] = (context) => {
	const dispatcher = resolveDispatcher() as Dispatcher;
	return dispatcher.useContext(context);
};

// 内部数据共享层
// react包中定义__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED并导出 -> 函数组件引用react包中的useState -> 并且在函数组件中使用
// -> 运行时执行函数组件(react-reconciler引入shared中的internals并对他进行赋值不同时期的hook，shared中的internals其实是引用的react包中的__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED)
// -> 同时react-dom打包的时候没有把react打进来（作为外部依赖），因此__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED一直就是同一个对象。
// 如果打包进来了那么我们函数组件引入的react中的hook和react-reconcile赋值的hook就不是同一个对象了（react-reconcile赋值他打包进来的react中的共享层对象，因为react-reconcile引入的shared的共享层是打包的react里的共享层）
export const __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = {
	currentDispatcher,
	currentBatchConfig
};

export const version = '0.0.0';
// 根据环境使用jsx还是jsxDEV  生产环境用jsx，开发环境用jsxDEV
// export const createElement = jsxDEV;
export const createElement = jsx;
export const isValidElement = isValidElementFn;
