import {
	createContainer,
	updateContainer
} from 'react-reconciler/src/fiberReconciler';
import { Container } from './hostConfig';
import { ReactElementType } from 'shared/ReactTypes';
import { initEvent } from './SyntheticEvent';

// ReactDOM.createRoot(#root).render(<App/>)
export function createRoot(container: Container) {
	const root = createContainer(container);

	return {
		render(element: ReactElementType) {
			// 初始化事件系统
			// 事件代理到container
			initEvent(container, 'click');
			return updateContainer(element, root);
		}
	};
}
