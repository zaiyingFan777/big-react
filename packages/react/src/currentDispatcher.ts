// 内部数据共享层，当前使用的Hooks集合

import { Action, ReactContext } from 'shared/ReactTypes';

// react开发者 => import { useState } from 'react' => 内部数据共享层--当前使用的Hooks集合 => Reconciler(mount时：useState、update时：useState、Hook上下文：useState)

export interface Dispatcher {
	// const [num, setNum] = useState(0 | (num) => num + 1)
	useState: <T>(initialState: (() => T) | T) => [T, Dispatch<T>];
	useEffect: (callback: () => void | void, deps: any[] | void) => void;
	useTransition: () => [boolean, (callback: () => void) => void];
	useRef: <T>(initialValue: T) => { current: T };
	useContext: <T>(context: ReactContext<T>) => T;
}

export type Dispatch<State> = (action: Action<State>) => void;

const currentDispatcher: { current: Dispatcher | null } = {
	current: null
};

export const resolveDispatcher = (): Dispatcher => {
	const dispatcher = currentDispatcher.current;

	if (dispatcher === null) {
		throw new Error('hooks只能用在函数组件中执行');
	}

	return dispatcher;
};

export default currentDispatcher;
