// react-dom事件系统
import { Container } from 'hostConfig';
import { Props } from 'shared/ReactTypes';

// 在dom的elementPropsKey属性上保存rectElement props
export const elementPropsKey = '__props';

const validEventTypeList = ['click'];

type EventCallback = (e: Event) => void;

// 捕获、冒泡，我们模拟实现。那么阻止捕获、阻止冒泡也是我们模拟实现的
interface SyntheticEvent extends Event {
	__stopPropagation: boolean;
}

interface Paths {
	capture: EventCallback[];
	bubble: EventCallback[];
}

export interface DOMElement extends Element {
	[elementPropsKey]: Props;
}

// dom[xxx] = reactElement props
// 此方法是将reactElement props保存在dom的elementPropsKey属性上
export function updateFiberProps(node: DOMElement, props: Props) {
	node[elementPropsKey] = props;
}

// 初始化
export function initEvent(container: Container, eventType: string) {
	if (!validEventTypeList.includes(eventType)) {
		console.warn('当前不支持', eventType, '事件');
		return;
	}

	if (__DEV__) {
		console.log('初始化事件', eventType);
	}
	// reactDOM.render()后事件代理在container上，这样我们点击container里面的dom元素时，e.target就是点击的dom元素
	// 然后dispatchEvent就1.从e.target被点击的元素向上收集沿途的事件一直到container，2.构造合成事件 3.遍历capture捕获 4.遍历冒泡click
	container.addEventListener(eventType, (e) => {
		dispatchEvent(container, eventType, e);
	});
}

// 创建合成事件
function createSyntheticEvent(e: Event) {
	const syntheticEvent = e as SyntheticEvent;
	// 默认不阻止冒泡、捕获
	syntheticEvent.__stopPropagation = false;
	// 原始的e.stopPropagation
	const originStopPropagation = e.stopPropagation;
	// 定义合成事件的阻止
	syntheticEvent.stopPropagation = () => {
		syntheticEvent.__stopPropagation = true;
		if (originStopPropagation) {
			// 执行原始的stopPropagation
			originStopPropagation();
		}
	};
	return syntheticEvent;
}

// dom、事件类型、事件对象
function dispatchEvent(container: Container, eventType: string, e: Event) {
	const targetElement = e.target;

	if (targetElement === null) {
		console.warn('事件不存在target', e);
		return;
	}
	// 1.收集沿途的事件
	const { bubble, capture } = collectPaths(
		targetElement as DOMElement,
		container,
		eventType
	);
	// 2.构造合成事件
	const se = createSyntheticEvent(e);
	// 3.遍历capture 先捕获后冒泡
	triggerEventFlow(capture, se);
	if (!se.__stopPropagation) {
		// 4.遍历bubble
		triggerEventFlow(bubble, se);
	}
}

// 遍历capture、bubble的回调
function triggerEventFlow(paths: EventCallback[], se: SyntheticEvent) {
	for (let i = 0; i < paths.length; i++) {
		const callback = paths[i];
		// call apply立即执行、bind生成一个函数不会立即执行
		callback.call(null, se);

		if (se.__stopPropagation) {
			// 阻止事件传播
			break;
		}
	}
}

function getEventCallbackNameFromEventType(
	eventType: string
): string[] | undefined {
	return {
		click: ['onClickCapture', 'onClick'] // 顺序不能搞错
	}[eventType];
}

// 收集从target到container沿途的eventType类型的事件回调
function collectPaths(
	targetElement: DOMElement,
	container: Container,
	eventType: string
) {
	const paths: Paths = {
		capture: [],
		bubble: []
	};

	while (targetElement && targetElement !== container) {
		// 向上收集的过程
		const elementProps = targetElement[elementPropsKey];
		if (elementProps) {
			// click  -> onClick onClickCapture
			// elementProps => {className: 'xxx', style: 'yyy', onClick: function(){}, onClickCapture: function(){}}
			const callbackNameList = getEventCallbackNameFromEventType(eventType);
			if (callbackNameList) {
				// callbackNameList: ['onClickCapture', 'onClick']
				callbackNameList.forEach((callbackName, i) => {
					const eventCallback = elementProps[callbackName];
					if (eventCallback) {
						if (i === 0) {
							// capture 事件捕获
							// div1   onClick onClickCapture  container
							//   div2 onClick onClickCapture
							//     p  onClick                 targetElement
							// paths.bubble: [p(targetElement).onClick, div2.onClick, container.onClick]
							// paths.capture: [container.onClickCapture, div2.onClickCapture]]
							// 事件捕获：div1->div2->p
							// 事件冒泡：p->div2->div1
							// 反向插入
							paths.capture.unshift(eventCallback);
						} else {
							// click事件冒泡
							paths.bubble.push(eventCallback);
						}
					}
				});
			}
		}

		targetElement = targetElement.parentNode as DOMElement;
	}
	return paths;
}
