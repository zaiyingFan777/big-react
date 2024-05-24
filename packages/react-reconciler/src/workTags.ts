export type WorkTag =
	| typeof FunctionComponent
	| typeof HostRoot
	| typeof HostComponent
	| typeof HostText;

export const FunctionComponent = 0;
export const HostRoot = 3; // 项目挂载的根组件，ReactDom.render(<App/>)
export const HostComponent = 5; // <div/>
export const HostText = 6; // <div>123</div> 123就是文本
