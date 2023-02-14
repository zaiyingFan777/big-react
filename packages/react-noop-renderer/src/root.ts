// ReactDOM.createRoot(root).render(<App/>);
import {
	createContainer,
	updateContainer
} from 'react-reconciler/src/fiberReconciler';
import { Container, Instance } from './hostConfig';
import { ReactElementType } from 'shared/ReactTypes';
import { REACT_ELEMENT_TYPE, REACT_FRAGMENT_TYPE } from 'shared/ReactSymbols';
import * as Scheduler from 'scheduler';

let idCounter = 0;

export function createRoot() {
	// 创建container
	const container: Container = {
		rootID: idCounter++,
		children: []
	};

	// @ts-ignore
	const root = createContainer(container); // FiberRootNode

	function getChildren(parent: Container | Instance) {
		if (parent) {
			return parent.children;
		}
		return null;
	}

	// 以ReactElement的形式导出树状结构
	function getChildrenAsJSX(root: Container) {
		const children = childToJSX(getChildren(root));
		if (Array.isArray(children)) {
			// 构造成fragment
			return {
				$$typeof: REACT_ELEMENT_TYPE,
				type: REACT_FRAGMENT_TYPE,
				key: null,
				ref: null,
				props: { children },
				__mark: 'big-react'
			};
		}
		return children;
	}

	function childToJSX(child: any): any {
		// 文本节点
		if (typeof child === 'string' || typeof child === 'number') {
			return child;
		}

		if (Array.isArray(child)) {
			if (child.length === 0) {
				return null;
			}
			if (child.length === 1) {
				return childToJSX(child[0]);
			}
			const children = child.map(childToJSX);

			if (
				children.every(
					(child) => typeof child === 'string' || typeof child === 'number'
				)
			) {
				// 如果所有的child都是string或者number，则将所有的child合并成字符串
				return children.join('');
			}
			// [TextInstance, TextInstance, Instance]
			return children;
		}

		// Instance，如果child的children是一个数组，这就是instance情况
		if (Array.isArray(child.children)) {
			const instance: Instance = child;
			// 将children转成jsx
			const children = childToJSX(instance.children);
			const props = instance.props;

			if (children !== null) {
				props.children = children;
			}

			return {
				$$typeof: REACT_ELEMENT_TYPE,
				type: instance.type,
				key: null,
				ref: null,
				props,
				__mark: 'big-react'
			};
		}

		// TextInstance
		return child.text;
	}

	return {
		_Scheduler: Scheduler,
		render(element: ReactElementType) {
			return updateContainer(element, root);
		},
		getChildren() {
			return getChildren(container); // 数组
		},
		getChildrenAsJSX() {
			return getChildrenAsJSX(container);
		}
	};
}
