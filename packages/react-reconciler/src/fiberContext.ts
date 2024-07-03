import { ReactContext } from 'shared/ReactTypes';

// 记录上一次context的value
let prevContextValue: any = null;
const prevContextValueStack: any[] = [];

// const ctx = createContext(0); context._currentValue = 0
// <ctx.Provider value={1}>  // 入栈：prevContextValueStack: [null]; prevContextValue = context._currentValue = 0; context._currentValue = 1;
//   <Cpn />    // context._currentValue = 1;
// </ctx.Provider> // 出栈 context._currentValue = prevContextValue = 0; prevContextValue = [null].pop() = null;
// <Cpn /> // context._currentValue = 0;

// 入栈  beginWork
export function pushProvider<T>(context: ReactContext<T>, newValue: T) {
	prevContextValueStack.push(prevContextValue);
	// 记录上一次context._currentvalue
	prevContextValue = context._currentValue;
	context._currentValue = newValue;
}

// 出栈 completeWork
export function popProvider<T>(context: ReactContext<T>) {
	context._currentValue = prevContextValue; /* 上一个context._currentValue */

	// 出栈（取出最后一个元素并赋值给prevContextValueStack）
	prevContextValue = prevContextValueStack.pop();
}
