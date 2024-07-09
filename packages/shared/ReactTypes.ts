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

export type Usable<T> = Thenable<T> | ReactContext<T>;

export interface Wakeable<Result = any> {
	then(
		onFulfill: () => Result,
		onReject: () => Result
	): void | Wakeable<Result>;
}

interface ThenableImpl<T, Result, Err> {
	then(
		onFulfill: (value: T) => Result,
		onReject: (error: Err) => Result
	): void | Wakeable<Result>;
}

interface UntrackedThenable<T, Result, Err>
	extends ThenableImpl<T, Result, Err> {
	status?: void;
}

export interface PendingThenable<T, Result, Err>
	extends ThenableImpl<T, Result, Err> {
	status: 'pending';
}

export interface FulfilledThenable<T, Result, Err>
	extends ThenableImpl<T, Result, Err> {
	status: 'fulfilled';
	value: T;
}

export interface RejectedThenable<T, Result, Err>
	extends ThenableImpl<T, Result, Err> {
	status: 'rejected';
	reason: Err;
}

// untracked 未被追踪到的状态
// pending   promise 的 pending状态
// fulfilled promise的resolve状态
// rejected  promise的reject状态
export type Thenable<T, Result = void, Err = any> =
	| UntrackedThenable<T, Result, Err>
	| PendingThenable<T, Result, Err>
	| FulfilledThenable<T, Result, Err>
	| RejectedThenable<T, Result, Err>;
