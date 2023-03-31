import { Action } from 'shared/ReactTypes';

// 当前使用的hooks的集合
// const [num, updateNum] = useState(0); // 0 对应了泛型中的T(状态)
// const [num, updateNum] = useState((num) => num + 1); // (num) => num + 1 对应了泛型中的() => T函数状态
// 返回值num对应了T，updateNum对应的是Dispatch<T>
// Dispatch可以是状态updateNum(1)也可以是改变状态的函数updateNum(num + 1)
export interface Dispatcher {
	useState: <T>(initialState: (() => T) | T) => [T, Dispatch<T>];
	useEffect: (callback: () => void | void, deps: any[] | void) => void;
	useTransition: () => [boolean, (callback: () => void) => void];
}

export type Dispatch<State> = (action: Action<State>) => void;

const currentDispatcher: { current: Dispatcher | null } = {
	current: null
};

export const resolveDispatcher = (): Dispatcher => {
	const dispatcher = currentDispatcher.current;

	if (dispatcher === null) {
		throw new Error('hook只能在函数组件中执行');
	}

	return dispatcher;
};

export default currentDispatcher;
