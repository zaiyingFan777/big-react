import { ReactContext } from 'shared/ReactTypes';

const valueStack: any[] = [];

// 入栈
export function pushProvider<T>(context: ReactContext<T>, newValue: T) {
	// 1.入栈、修改context的_currentValue
	valueStack.push(newValue);
	context._currentValue = newValue;
}

// 出栈
export function popProvider<T>(context: ReactContext<T>) {
	// 1.从栈顶pop出来
	const currentValue = valueStack[valueStack.length - 1];
	context._currentValue = currentValue;
	valueStack.pop();
}
