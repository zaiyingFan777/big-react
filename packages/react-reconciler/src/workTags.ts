export type WorkTag =
	| typeof FunctionComponent
	| typeof HostRoot
	| typeof HostComponent
	| typeof HostText
	| typeof Fragment
	| typeof ContextProvider;

// 函数组件的类型
export const FunctionComponent = 0;
// ReactDOM.render挂载的根节点
export const HostRoot = 3;
// <div></div>
export const HostComponent = 5;
// <div>123</div> 中的123这个文本
export const HostText = 6;
export const Fragment = 7;
export const ContextProvider = 8;
