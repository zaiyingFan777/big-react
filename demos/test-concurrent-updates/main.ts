// 1.实际上在 60Hz 刷新率（16.6ms / 帧）下，浏览器自身的渲染流水线（布局、绘制、合成等）会占用约 10-12ms，
// 真正留给 JavaScript 执行的安全时间只有约 5ms，这也是时间切片更精准的阈值设定依据
// 2.我们的任务是8ms，这样的话肯定会影响渲染导致掉帧，那么就切成2个4ms的小任务（react异步可中断的并发更新）
// 3.时间切片：将一个很长的可能会引发掉帧的宏任务，切成几个短的、可能不会掉帧的宏任务

import {
	unstable_ImmediatePriority as ImmediatePriority,
	unstable_UserBlockingPriority as UserBlockingPriority, // 比如点击事件
	unstable_NormalPriority as NormalPriority,
	unstable_LowPriority as LowPriority,
	unstable_IdlePriority as IdlePriority,
	unstable_scheduleCallback as scheduleCallback,
	unstable_shouldYield as shouldYield,
	CallbackNode,
	unstable_getFirstCallbackNode as getFirstCallbackNode,
	unstable_cancelCallback as cancelCallback
} from 'scheduler';

import './style.css';
const button = document.querySelector('button');
const root = document.querySelector('#root');

type Priority =
	| typeof IdlePriority
	| typeof LowPriority
	| typeof NormalPriority
	| typeof UserBlockingPriority
	| typeof ImmediatePriority;

interface Work {
	count: number;
	priority: Priority;
}

const workList: Work[] = [];
let prevPriority: Priority = IdlePriority;
let curCallback: CallbackNode | null = null;

[LowPriority, NormalPriority, UserBlockingPriority, ImmediatePriority].forEach(
	(priority) => {
		const btn = document.createElement('button');
		root?.appendChild(btn);
		btn.innerText = [
			'',
			'ImmediatePriority',
			'UserBlockingPriority',
			'NormalPriority',
			'LowPriority'
		][priority];
		btn.onclick = () => {
			workList.unshift({
				count: 100,
				priority: priority as Priority
			});
			schedule();
		};
	}
);

function schedule() {
	const cbNode = getFirstCallbackNode();
	// 对优先级排序，越小优先级越高
	const curWork = workList.sort((w1, w2) => w1.priority - w2.priority)[0];

	// 策略逻辑
	if (!curWork) {
		curCallback = null;
		cbNode && cancelCallback(cbNode);
		return;
	}

	const { priority: curPriority } = curWork;
	// 优先级没有变化，则继续执行之前的优先级
	if (curPriority === prevPriority) {
		return;
	}
	// 更高优先级的work
	cbNode && cancelCallback(cbNode);

	curCallback = scheduleCallback(curPriority, perform.bind(null, curWork));
}

// didTimeout: scheduleCallback传入的参数
function perform(work: Work, didTimeout?: boolean) {
	/**
	 * 1. work.priority: 如果是同步优先级不能中断
	 * 2. 饥饿问题: didTimeout为true，如果一个任务一直没有执行，那么它的优先级会越来越高，直至这个任务过期了，就变成了同步任务，也不能中断
	 * 3. 时间切片: shouldYield为false表示没有用尽，为true的话则是用尽, 如果时间切片的时间用完了，那么就停下来，让浏览器执行渲染
	 */
	const needSync = work.priority === ImmediatePriority || didTimeout;
	// while为true: 同步更新、或者是时间切片没有用尽
	while ((needSync || !shouldYield()) && work.count) {
		work.count--;
		insertSpan(work.priority + '');
	}

	// 中断执行 || 执行完
	prevPriority = work.priority;

	// 执行完毕，将本次工作在任务队列中删除
	if (!work.count) {
		const workIndex = workList.indexOf(work);
		workList.splice(workIndex, 1);
		prevPriority = IdlePriority;
	}

	const prevCallback = curCallback;
	// 调度一下，看是否有更高优先级的任务
	schedule();
	const newCallback = curCallback;

	if (newCallback && prevCallback === newCallback) {
		// 两次调度，优先级是一致的，因此继续调度当前任务的perform
		return perform.bind(null, work);
	}
}

function insertSpan(content) {
	const span = document.createElement('span');
	span.innerText = content;
	span.className = `pri-${content}`;
	doSomeBuzyWork(10000000);
	root?.appendChild(span);
}

function doSomeBuzyWork(len: number) {
	let result = 0;
	while (len--) {
		result += len;
	}
}
