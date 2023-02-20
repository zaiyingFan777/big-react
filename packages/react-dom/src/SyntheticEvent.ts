// 这里存放所有与reactDOM相关的事件系统
// 将事件回调保存在DOM中，通过以下两个时机对接：1.创建dom时，2.更新属性时

// 当我们在目标元素触发点击事件后，这个事件会被代理到container下面（应用挂载的根节点），接下来我们要收集触发事件的dom element到container之间的所有祖先element的props中对应事件的回调
// 我们要做的是：一层一层遍历找到从目标元素到container之间所有祖先元素的elementPropsKey中也就是他保存的props中有没有对应的事件回调（对于点击事件就是onClickCapute、onClick），对于
// onClickCapute就保存在capture数组中，对于onClick就保存在bubble数组中。capture是所有捕获阶段需要执行的回调，bubble为所有冒泡阶段需要执行的回调，然后我们依次遍历capture、bubble,执行他们
// 这样我们就模拟实现了捕获阶段以及冒泡阶段
// 事件捕获 onClickCapute
// 事件冒泡 onClick

import { Container } from 'hostConfig';
import {
	unstable_ImmediatePriority,
	unstable_NormalPriority,
	unstable_UserBlockingPriority,
	unstable_runWithPriority
} from 'scheduler';
import { Props } from 'shared/ReactTypes';

// 在dom的elementPropsKey字段上保存
export const elementPropsKey = '__props';
// 当前支持的事件
const validEventTypeList = ['click'];

type EventCallback = (e: Event) => void;

// 合成事件
interface SyntheticEvent extends Event {
	__stopPropagation: boolean; // 我们要阻止捕获阻止冒泡是我们自己实现的
}

interface Paths {
	capture: EventCallback[];
	bubble: EventCallback[];
}

// 由于需要在dom新增类型，定义一个类型
export interface DOMElement extends Element {
	[elementPropsKey]: Props;
}

// 我们在dom的某一个属性上保存dom对应的reactElement的props
// dom[xxx] = reactElement props
export function updateFiberProps(node: DOMElement, props: Props) {
	node[elementPropsKey] = props;
}

export function initEvent(container: Container, eventType: string) {
	// eventType事件类型
	if (!validEventTypeList.includes(eventType)) {
		console.warn('当前不支持', eventType, '事件');
		return;
	}
	if (__DEV__) {
		console.log('初始化事件：', eventType);
	}
	container.addEventListener(eventType, (e) => {
		dispatchEvent(container, eventType, e);
	});
}

// 构造合成事件
function createSyntheticEvent(e: Event) {
	const syntheticEvent = e as SyntheticEvent;
	syntheticEvent.__stopPropagation = false;
	// 原始的
	const originStopPropagation = e.stopPropagation;
	// 定义合成事件的stopPropagation
	syntheticEvent.stopPropagation = () => {
		syntheticEvent.__stopPropagation = true;
		if (originStopPropagation) {
			originStopPropagation();
		}
	};
	return syntheticEvent;
}

// 遍历capture、bubble
function triggerEventFlow(paths: EventCallback[], se: SyntheticEvent) {
	for (let i = 0; i < paths.length; i++) {
		const callback = paths[i];
		// 传入合成事件的类型，转换为优先级
		// 将当前的上下文优先级改为传入的eventTypeToSchedulerPriority(se.type)优先级
		// 先点击事件执行回调->setState, setState的时候获取当前的schedule优先级并转换为react的lane
		unstable_runWithPriority(eventTypeToSchedulerPriority(se.type), () => {
			// 执行回调函数
			callback.call(null, se);
		});

		if (se.__stopPropagation) {
			// 阻止事件传播
			break;
		}
	}
}

function dispatchEvent(container: Container, eventType: string, e: Event) {
	const targetElement = e.target;

	if (targetElement === null) {
		console.warn('事件不存在target', e);
		return;
	}
	// 1. 收集沿途的事件(收集targetElement到container所有的domElement中对应的事件的回调)
	const { bubble, capture } = collectPaths(
		targetElement as DOMElement,
		container,
		eventType
	);
	// 2. 构造合成事件
	const se = createSyntheticEvent(e);
	// 3. 遍历capture
	triggerEventFlow(capture, se);

	if (!se.__stopPropagation) {
		// 如果合成事件的__stopPropagation为false不需要阻止冒泡
		// 如果合成事件的__stopPropagation为true，需要阻止冒泡
		// 4. 遍历bubble
		triggerEventFlow(bubble, se);
	}
}

// 通过eventType(click)获取事件的回调名(onClick onClickCapture)
function getEventCallbackNameFromEventType(
	eventType: string
): string[] | undefined {
	return {
		click: ['onClickCapture', 'onClick'] // 第0项为捕获，第1项为冒泡
	}[eventType];
}

// 收集沿途的事件
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
		// 收集的过程
		const elementProps = targetElement[elementPropsKey];
		if (elementProps) {
			// click -> onClick onClickCapture
			const callbackNameList = getEventCallbackNameFromEventType(eventType);
			if (callbackNameList) {
				callbackNameList.forEach((callbackName, i) => {
					const eventCallback = elementProps[callbackName];
					if (eventCallback) {
						// 这里为什么要分别不同的处理
						// container onClick onClickCapture
						//   div onClick onClickCapture
						//     p targetElement onClick
						// bubble [p onClick, div onClick, container onClick] 遍历的时候从下往上 从目标元素到container，就是模拟冒泡
						// capture [container onClick, div onClick] 遍历数组的时候从上往下 从container到target，就是模拟捕获
						if (i === 0) {
							// capture
							paths.capture.unshift(eventCallback); // 插到最前面
						} else {
							// bubble
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

// 根据事件类型转换为调度的优先级
function eventTypeToSchedulerPriority(eventType: string) {
	switch (eventType) {
		case 'click':
		case 'keydown':
		case 'keyup':
			return unstable_ImmediatePriority;
		case 'scroll':
			return unstable_UserBlockingPriority;
		default:
			return unstable_NormalPriority;
	}
}
