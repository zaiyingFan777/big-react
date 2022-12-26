export type Type = any;
export type Key = any;
export type Ref = any;
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
