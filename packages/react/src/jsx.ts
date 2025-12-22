import { REACT_ELEMENT_TYPE, REACT_FRAGMENT_TYPE } from 'shared/ReactSymbols';
import {
	ElementType,
	Key,
	Props,
	ReactElementType,
	Ref,
	Type
} from 'shared/ReactTypes';

// jsx 或 React.createElement的返回结果是：ReactElement的数据结构
// ReactElement
const ReactElement = function (
	type: Type,
	key: Key,
	ref: Ref,
	props: Props
): ReactElementType {
	const element = {
		$$typeof: REACT_ELEMENT_TYPE, // ReactElement标识符
		type,
		key,
		ref,
		props,
		__mark: 'KaSong'
	};
	return element;
};

export function isValidElement(object: any) {
	return (
		typeof object === 'object' &&
		object !== null &&
		object.$$typeof === REACT_ELEMENT_TYPE
	);
}

// <div id="id1" className="cls1" key="key1">123</div> =>
// import { jsx as _jsx } from 'react/jsx-runtime';
// /*#__PURE__*/_jsx("div", {
//   id: "id1",
//   className: "cls1",
//   children: "123"
// }, "key1");
export const jsx = (type: ElementType, config: any, ...maybeChildren: any) => {
	let key: Key = null;
	const props: Props = {};
	let ref: Ref = null;

	for (const prop in config) {
		const val = config[prop];
		if (prop === 'key') {
			if (val !== undefined) {
				key = '' + val;
			}
			continue;
		}
		if (prop === 'ref') {
			if (val !== undefined) {
				ref = val;
			}
			continue;
		}
		// ! 仅当属性 prop 是对象 config 自身的属性（非原型链继承）时，才将该属性赋值到 props 对象
		if ({}.hasOwnProperty.call(config, prop)) {
			props[prop] = val;
		}
	}
	const maybeChildrenLength = maybeChildren.length;
	if (maybeChildrenLength) {
		if (maybeChildrenLength === 1) {
			// [child]
			props.children = maybeChildren[0];
		} else {
			// [child, child, child]
			props.children = maybeChildren;
		}
	}
	return ReactElement(type, key, ref, props);
};

// 由于babel会将jsx编译为 jsxs(Fragemnt, {children: [xxx]})，因此我们需要把Fragment(type)导出
export const Fragment = REACT_FRAGMENT_TYPE;

export const jsxDEV = (type: ElementType, config: any) => {
	let key: Key = null;
	const props: Props = {};
	let ref: Ref = null;

	for (const prop in config) {
		const val = config[prop];
		if (prop === 'key') {
			if (val !== undefined) {
				key = '' + val;
			}
			continue;
		}
		if (prop === 'ref') {
			if (val !== undefined) {
				ref = val;
			}
			continue;
		}
		if ({}.hasOwnProperty.call(config, prop)) {
			props[prop] = val;
		}
	}

	return ReactElement(type, key, ref, props);
};
