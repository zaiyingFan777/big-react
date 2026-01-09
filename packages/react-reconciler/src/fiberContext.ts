import { ReactContext } from 'shared/ReactTypes';

let prevContextValue: any = null;
const prevContextValueStack: any[] = [];

// beginWork 入栈
// const ctx = createContext(0);

// <ctx.Provider value={1}>
//   <Cpn />
// </ctx.Provider>
// <Cpn />
// 以上面举例
// 进入到beginWork中
// prevContextValueStack.push(null)
// prevContextValue = context._currentValue => prevContextValue = 0
// context._currentValue = newValue; => context._currentValue => 1
export function pushProvider<T>(context: ReactContext<T>, newValue: T) {
	prevContextValueStack.push(prevContextValue);

	// 保存当前context当前的_currentValue
	prevContextValue = context._currentValue;
	// 将新的value赋值给context._currentValue
	context._currentValue = newValue;
}

// completeWork 出栈
// const ctx = createContext(0);

// <ctx.Provider value={1}>
//   <Cpn />
// </ctx.Provider>
// <Cpn />
// 继续这个例子
// context._currentValue = prevContextValue; => context._currentValue = 0
// prevContextValue = prevContextValueStack.pop(); => prevContextValue = null
export function popProvider<T>(context: ReactContext<T>) {
	// 上一个context._currentValue
	context._currentValue = prevContextValue;

	prevContextValue = prevContextValueStack.pop();
}
