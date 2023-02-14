// ReactDOM.createRoot(root).render(<App/>);
import {
	createContainer,
	updateContainer
} from 'react-reconciler/src/fiberReconciler';
import { Container } from './hostConfig';
import { ReactElementType } from 'shared/ReactTypes';
import { initEvent } from './SyntheticEvent';

export function createRoot(container: Container) {
	const root = createContainer(container); // FiberRootNode

	return {
		render(element: ReactElementType) {
			// 初始化合成事件以及类型
			initEvent(container, 'click');
			return updateContainer(element, root);
		}
	};
}
