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
			// 事件代理到container，然后每次点击会从target到container沿途收集所有的事件捕获、事件冒泡，再去模拟执行这些
			initEvent(container, 'click');
			return updateContainer(element, root);
		}
	};
}
