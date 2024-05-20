// 当前环境是否支持symbol
const supportSymbol = typeof Symbol === 'function' && Symbol.for;

export const REACT_ELEMENT_TYPE = supportSymbol
	? Symbol.for('react.element') // 创建一个独一无二的值
	: 0xeac7; // 60103
