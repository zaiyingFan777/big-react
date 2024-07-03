import { REACT_CONTEXT_TYPE, REACT_PROVIDER_TYPE } from 'shared/ReactSymbols';
import { ReactContext } from 'shared/ReactTypes';

// const cxt = createContext(defaultValue)
export function createContext<T>(defaultValue: T): ReactContext<T> {
	// 创建context
	const context: ReactContext<T> = {
		$$typeof: REACT_CONTEXT_TYPE,
		Provider: null,
		_currentValue: defaultValue
	};
	// 创建provider
	context.Provider = {
		$$typeof: REACT_PROVIDER_TYPE,
		// 指向Provider对应的context
		_context: context
	};
	return context;
}
