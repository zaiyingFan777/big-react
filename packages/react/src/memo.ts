import { FiberNode } from 'react-reconciler/src/fiber';
import { REACT_MEMO_TYPE } from 'shared/ReactSymbols';
import { Props } from 'shared/ReactTypes';

// React.memo(function App(){/** .... */})
export function memo(
	type: FiberNode['type'],
	compare?: (oldProps: Props, newProps: Props) => boolean
) {
	const fiberType = {
		$$typeof: REACT_MEMO_TYPE,
		type, // 函数组件render函数
		compare: compare === undefined ? null : compare
	};
	// fiberType为memo对应的fiber的type属性
	// 那么memoFiber.type.type就是函数组件的render函数
	return fiberType;
}
