// jsx或者React.createElement执行返回的结果是一种被称为ReactElement的数据结构
import { REACT_ELEMENT_TYPE, REACT_FRAGMENT_TYPE } from 'shared/ReactSymbols';
import {
	Type,
	Key,
	Ref,
	Props,
	ReactElementType,
	ElementType
} from 'shared/ReactTypes';

// type为ReactElement的类型
// 组件的key，ref，props
// 为了防止别人滥用我们的ReactElement，因此定义为一个独一无二的值，所以我们使用symbol
const ReactElement = function (
	type: Type,
	key: Key,
	ref: Ref,
	props: Props
): ReactElementType {
	const element = {
		$$typeof: REACT_ELEMENT_TYPE, // $$typeOf指明当前的数据结构为我们的ReactElement类型
		type,
		key,
		ref,
		props,
		__mark: 'big-react' // 真实环境没有这个字段
	};
	return element;
};

// isValidElement 是否是合法的ReactElement
export function isValidElement(object: any) {
	return (
		typeof object === 'object' &&
		object !== null &&
		object.$$typeof === REACT_ELEMENT_TYPE
	);
}

// createElement方法
// 只是积累: function a(x, y, ...z) {console.log(x, y, z)} a(1) => 1 undefined []，a(1, 2) => 1 2 [], a(1,2,3) => 1 2 [3]
// 解决key消失
export const createElement = (
	type: ElementType,
	config: any,
	...maybeChildren: any
) => {
	// config中有key, ref我们需要单独处理一下
	let key: Key = null;
	const props: Props = {};
	let ref: Ref = null;

	// 遍历config的key赋值给props
	for (const prop in config) {
		const val = config[prop];
		if (prop === 'key') {
			if (val !== undefined) {
				key = '' + val;
			}
			// 跳过本次循环不处理下面的逻辑
			continue;
		}
		if (prop === 'ref') {
			if (val !== undefined) {
				ref = val;
			}
			continue;
		}
		// 处理config自己身上的属性，而非原型上的，就将key赋值给props
		if ({}.hasOwnProperty.call(config, prop)) {
			props[prop] = val;
		}
	}
	// 处理maybeChildren
	const maybeChildrenLength = maybeChildren.length;
	// 长度为1[child]，长度大于1[child, child, ...]
	if (maybeChildrenLength) {
		if (maybeChildrenLength === 1) {
			props.children = maybeChildren[0];
		} else {
			props.children = maybeChildren;
		}
	}
	return ReactElement(type, key, ref, props);
};

export const Fragment = REACT_FRAGMENT_TYPE;

// jsxDEV: 开发环境，jsx: 生产环境
// 实际react，生产开发环境下是不同的实现，开发环境可以做额外的检查，我们这里不需要
// creatElement与jsx方法的差异，前者是把key放到config里面，后者是放到方法的第三个参数突出key的重要性
// jsx的参数如下：
// 1.对于开发环境，jsxDEV参数依次为type、props、key、source、self。其中后两者为开发环境用于调试的参数
// 2.对于生产环境，jsx参数依次为type、props、key
// createElement的参数依次为type、props、...children。其中children及后续其他传参经过转换都会作为children属性
// export const jsxDEV = function (type: ElementType, config: any) {
export const jsx = (type: ElementType, config: any, maybeKey: any) => {
	// console.log(arguments); arguments[2]就是key
	// config中有key, ref我们需要单独处理一下
	let key: Key = null;
	const props: Props = {};
	let ref: Ref = null;

	if (maybeKey !== undefined) {
		key = '' + maybeKey;
	}

	// 遍历config的key赋值给props
	for (const prop in config) {
		const val = config[prop];
		if (prop === 'key') {
			if (val !== undefined) {
				key = '' + val;
			}
			// 跳过本次循环不处理下面的逻辑
			continue;
		}
		if (prop === 'ref') {
			if (val !== undefined) {
				ref = val;
			}
			continue;
		}
		// 处理config自己身上的属性，而非原型上的，就将key赋值给props
		if ({}.hasOwnProperty.call(config, prop)) {
			props[prop] = val;
		}
	}
	return ReactElement(type, key, ref, props);
};

export const jsxDEV = jsx;
