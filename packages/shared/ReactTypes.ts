export type Type = any;
export type Key = any;
// export type Key = string | null;
export type Ref = { current: any } | ((instance: any) => void);
// export type Props = {
// 	[key: string]: any;
// 	children?: any;
// };
export type Props = any;
export type ElementType = any;

export interface ReactElementType {
	$$typeof: symbol | number;
	type: ElementType;
	key: Key;
	props: Props;
	ref: Ref;
	__mark: string;
}

// Update更新数据结构的Action类型
// this.setState({xx:1})
// this.setState(({xx:1}) => ({xx:2}))
export type Action<State> = State | ((prevState: State) => State);

// context
export type ReactContext<T> = {
	$$typeof: symbol | number;
	// <ctx.Provider value={}></ctx.Provider>
	Provider: ReactProviderType<T> | null;
	// 上面value存放的值
	_currentValue: T;
};

export type ReactProviderType<T> = {
	$$typeof: symbol | number;
	// 指向Provider对应的context
	_context: ReactContext<T> | null;
};
