// jsx转换
// 1.编译时 babel帮我们转换的
// <div className="big" key="1">big-react</div>
// ==> jsx
// import { jsx as _jsx } from "react/jsx-runtime";
// /*#__PURE__*/_jsx("div", {
//   className: "big",
//   children: "big-react"
// }, "1");
// ==> React.createElement
// /*#__PURE__*/React.createElement("div", {
//   className: "big",
//   key: "1"
// }, "big-react");
// 2.运行时 需要我们自己实现jsx、React.createElement()等犯法将jsx()、React.createElement()转换成ReactElement
// jsx方法或React.createElement方法的实现（包括dev、prod两个环境）

import { REACT_ELEMENT_TYPE } from 'shared/ReactSymbols';
import type {
	ElementType,
	Key,
	Props,
	ReactElement,
	Ref,
	Type
} from 'shared/ReactTypes';

const ReactElement = function (
	type: Type,
	key: Key,
	ref: Ref,
	props: Props
): ReactElement {
	const element = {
		$$typeof: REACT_ELEMENT_TYPE,
		type,
		key,
		ref,
		props,
		__mark: 'big-react'
	};
	return element;
};

export const jsx = (type: ElementType, config: any, ...maybeChildren: any) => {
	let key: Key = null;
	const props: Props = {};
	let ref: Ref = null;

	for (const prop in config) {
		const val = config[prop];
		if (prop === 'key') {
			if (prop !== undefined) {
				key = '' + val;
			}
			continue;
		}
		if (prop === 'ref') {
			if (prop !== undefined) {
				ref = val;
			}
			continue;
		}
		if ({}.hasOwnProperty.call(config, prop)) {
			// 非原型上的属性，我们赋值给props
			// {}.hasOwnProperty.call(config, prop) 这段代码是用来检查 config 对象是否具有名为 prop 的自有属性。
			// 这里使用了 hasOwnProperty 方法，它是 JavaScript 中对象的一个内置方法，用于判断一个对象是否拥有指定的自有属性（不包括继承来的属性）。
			// 采用 .call() 方法是为了改变 hasOwnProperty 方法的调用上下文（即 this 的值），使其指向 config 对象。这样做可以确保正确地检查 config
			// 而不是默认的 hasOwnProperty 方法所属的对象（通常情况下是 Object.prototype）。
			// 这种写法在不确定 config 是否重写了 hasOwnProperty 方法或者为了防止属性查找被对象原型链上的同名方法干扰时非常有用。
			// 简而言之，这段代码的作用等同于（但更安全）config.hasOwnProperty(prop)，用于确定 config 对象是否有名为 prop 的直接属性。
			props[prop] = val;
		}
	}

	const maybeChildrenLength = maybeChildren.length;
	if (maybeChildrenLength) {
		// function test(a, b, ...c) {
		//   console.log(a,b,c)
		// }
		// test('a', 'b', 'c1', 'c2') => a, b, ['c1', 'c2']
		// test('a', 'b', 'c1') => a, b, ['c1']
		if (maybeChildrenLength === 1) {
			// 长度为1：child
			props.children = maybeChildren[0];
		} else {
			// 长度大于1: [child, child, child]
			props.children = maybeChildren;
		}
	}
	return ReactElement(type, key, ref, props);
};

export const jsxDEV = jsx;
