const supportSymbol = typeof Symbol === 'function' && Symbol.for;

// Symbol.for(key) 方法会根据给定的键 key，来从运行时的 symbol 注册表中找到对应的 symbol，如果找到了，则返回它，否则，新建一个与该键关联的 symbol，并放入全局 symbol 注册表中。
// 和 Symbol() 不同的是，用 Symbol.for() 方法创建的的 symbol 会被放入一个全局 symbol 注册表中。Symbol.for() 并不是每次都会创建一个新的 symbol，它会首先检查给定的 key 是否已经在注册表中了。假如是，则会直接返回上次存储的那个。否则，它会再新建一个。
// 示例
// ---------------------------------------------------------------------------------
// Symbol.for("foo"); // 创建一个 symbol 并放入 symbol 注册表中，键为 "foo"
// Symbol.for("foo"); // 从 symbol 注册表中读取键为"foo"的 symbol
// Symbol.for("bar") === Symbol.for("bar"); // true，证明了上面说的
// Symbol("bar") === Symbol("bar"); // false，Symbol() 函数每次都会返回新的一个 symbol
// ---------------------------------------------------------------------------------

export const REACT_ELEMENT_TYPE = supportSymbol
	? Symbol.for('react.element')
	: 0xeac7; // 60103

// ReactElement.type
export const REACT_FRAGMENT_TYPE = supportSymbol
	? Symbol.for('react.fragment')
	: 0xeacb; // 60107

// context
export const REACT_CONTEXT_TYPE = supportSymbol
	? Symbol.for('react.context')
	: 0xeac1; // 60097

// provider
export const REACT_PROVIDER_TYPE = supportSymbol
	? Symbol.for('react.provider')
	: 0xeac2; // 60098
