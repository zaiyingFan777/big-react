import { ReactElementType } from 'shared/ReactTypes';
// import { createRoot } from './src/root';
// @ts-ignore
import { createRoot } from 'react-dom';

// 这是用于测试的工具集，来源自ReactTestUtils.js，特点是：使用ReactDOM作为宿主环境
export function renderIntoDocument(element: ReactElementType) {
	const div = document.createElement('div');
	// 返回值element
	return createRoot(div).render(element);
}
