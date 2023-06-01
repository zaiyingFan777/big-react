export type Type = any;
export type Key = string | null;
// ref两种数据结构：
// 1.(instance: T) => void <div ref={dom => console.log(dom)}></div>
// 2.{current: T} <div ref={domRef}></div>
export type Ref = { current: any } | ((instance: any) => void) | null;
// export type Props = {
// 	[key: string]: any;
// 	children?: any;
// };
export type Props = any;
export type ElementType = any;

// ReactElement类型定义
export interface ReactElementType {
	$$typeof: symbol | number;
	type: ElementType;
	key: Key;
	ref: Ref;
	props: Props;
	__mark: string;
}

// action
// this.setState({xx: 1}) 中的 {xx: 1}
// this.setState(({xx: 1}) => {xx: 2}) 中的 ({xx: 1}) => {xx: 2}
export type Action<State> = State | ((preState: State) => State);

// context
export type ReactProviderType<T> = {
	$$typeof: symbol | number;
	// 指向reactContext
	_context: ReactContext<T>;
};

export type ReactContext<T> = {
	$$typeof: symbol | number;
	// Context.Provider jsx
	Provider: ReactProviderType<T> | null;
	// Consumer 由于函数组件使用useContext来消费context，所以这里我们先不需要，类组件需要
	_currentValue: T;
};
