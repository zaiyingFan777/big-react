// type WorkTag = 0 | 3 | 5 | 6 | 7
export type WorkTag =
	| typeof FunctionComponent
	| typeof HostRoot
	| typeof HostComponent
	| typeof HostText
	| typeof Fragment;

// fiberNode是什么类型的节点  fiberNode.tag
export const FunctionComponent = 0; // 函数
export const HostRoot = 3; // 挂载的根节点 ReactDom.render()
export const HostComponent = 5; // 比如<div></div>对应的类型就是HostComponent
export const HostText = 6; // 比如<div>123</div> 123这个文本
export const Fragment = 7; // 比如<div>123</div> 123这个文本
