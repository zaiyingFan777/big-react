// 比如60hz刷新，也就是16.6ms刷新一次，我们的任务是30ms，这样的话肯定会影响渲染导致掉帧，那么就切成2个15ms的任务，
// 时间切片：将一个很长的可能会引发掉帧的宏任务，切成几个短的、可能不会掉帧的宏任务

// 微任务没有优先级
// schedule五种优先级
import {
	unstable_ImmediatePriority as ImmediatePriority, // 同步优先级
	unstable_UserBlockingPriority as UserBlockingPriority, // 点击事件等
	unstable_NormalPriority as NormalPriority, // 正常优先级
	unstable_LowPriority as LowPriority, // 低优先级
	unstable_IdlePriority as IdlePriority, // 空闲优先级
	unstable_scheduleCallback as scheduleCallback,
	unstable_shouldYield as shouldYield, // 当前的时间切片是否用尽
	CallbackNode,
	unstable_getFirstCallbackNode as getFirstCallbackNode, // 获取当前正在调度的回调
	unstable_cancelCallback as cancelCallback // 取消回调
} from 'scheduler';
import './style.css';

// 取到第一个button 如果是找id #root
// const button = document.querySelector('button');
const root = document.querySelector('#root');

// 优先级: 数值越小优先级越高
// type Priority = 5 | 4 | 3 | 2 | 1
type Priority =
	| typeof IdlePriority
	| typeof LowPriority
	| typeof NormalPriority
	| typeof UserBlockingPriority
	| typeof ImmediatePriority;

// button点击创建一个数据结构 work，work里的count就是代表某一个工作要执行的次数，类比react 组件的数量(beginWork、completeWork类比成一个工作)，组件数量有多少，这个工作就要工作多少次
interface Work {
	count: number;
	priority: Priority;
}

const workList: Work[] = [];

// 上次更新的优先级
let prevPriority: Priority = IdlePriority;
// 当前的回调函数
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
				// 数组头插
				count: 100,
				priority: priority as Priority
			});
			schedule();
		};
	}
);

// 其实插入dom我们做了延时操作，不是说进入一个work，就一直走while的循环，而是被切片，可能会执行很多次perform或者schedule
// 调度work
function schedule() {
	// 当前调度的回调
	const cbNode = getFirstCallbackNode();
	// 增加优先级，取出最高优先级
	const curWork = workList.sort((w1, w2) => w1.priority - w2.priority)[0];

	// 策略逻辑
	if (!curWork) {
		// worklist为空
		curCallback = null;
		// worklist为空 取消之前调度，
		cbNode && cancelCallback(cbNode);
		return;
	}

	const { priority: curPriority } = curWork;
	if (curPriority === prevPriority) {
		// 优先级相等
		// 如果新进来一个优先级跟正在进行的任务一致
		return;
	}
	// 更高优先级的work
	// 取消之前的回调
	cbNode && cancelCallback(cbNode);
	// 然后再调度新的

	// 满足条件，调度
	// 宏任务循环
	curCallback = scheduleCallback(curPriority, perform.bind(null, curWork));
}

function perform(work: Work, didTimeout?: boolean) {
	// 任务变为可中断
	/**
	 * 1. work.priority 更高的优先级
	 * 2. 饥饿问题：如果我们有一个work一直竞争不过别人，就一直得不到执行，他的优先级就越来越高，那么直到他过期了，就同步执行
	 * 3. 时间切片
	 */
	// 遇到需要立即执行的优先级，或者过期了 需要同步
	const needSync = work.priority === ImmediatePriority || didTimeout;
	// shouldYield()为true说明时间切片用尽了，shouldYield()返回false说明时间切片没有被用尽
	while ((needSync || !shouldYield()) && work.count) {
		// 这里为不应该中断
		work.count--;
		insertSpan(work.priority + '');
	}

	// 中断执行 || 执行完 走这里
	prevPriority = work.priority; // 中断
	// 执行完删除本次优先级的work
	if (!work.count) {
		const workIndex = workList.indexOf(work);
		workList.splice(workIndex, 1);
		// work工作完了 重置优先级
		prevPriority = IdlePriority;
	}
	// 工作完毕继续调度
	// 多个work需要调度，单一work直接下面返回新的函数
	const prevCallback = curCallback;
	schedule();
	const newCallback = curCallback;

	if (newCallback && prevCallback === newCallback) {
		// 如果是单一work的话这样会继续调度返回的函数
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
	// 模拟耗时操作
	while (len--) {
		result += len;
	}
}
