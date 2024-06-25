import {
	unstable_ImmediatePriority as ImmediatePriority, // 1 同步优先级
	unstable_UserBlockingPriority as UserBlockingPriority, // 2 比如点击事件
	unstable_NormalPriority as NormalPriority, // 3 正常优先级
	unstable_LowPriority as LowPriority, // 4 低优先级
	unstable_IdlePriority as IdlePriority, // 5 空闲优先级
	unstable_scheduleCallback as scheduleCallback, // 调度器提供的调度某个工作的api
	unstable_shouldYield as shouldYield, // 调度器提供的是否中断的方法，时间切片是否用尽，false为没有用尽，true为用尽了
	CallbackNode,
	unstable_getFirstCallbackNode as getFirstCallbackNode,
	unstable_cancelCallback as cancelCallback
} from 'scheduler';
import './style.css';

const root = document.querySelector('#root');

type Priority =
	| typeof IdlePriority
	| typeof LowPriority
	| typeof NormalPriority
	| typeof UserBlockingPriority
	| typeof ImmediatePriority;

// 宏任务中完成调度，本质上是个大的宏任务循环，循环的驱动力是Scheduler
interface Work {
	count: number; // 某个工作要执行的次数，类比react中组件的数量
	priority: Priority; // 优先级
}

const workList: Work[] = [];
// 保存上次工作的优先级
let prevPriority: Priority = IdlePriority;
// 当前调度的回调函数
let curCallback: CallbackNode | null = null;

// 创建四个优先级的按钮
// 1.交互，并把work插入到workList中
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
	// 2.找出workList中的优先级最高的任务
	const curWork = workList.sort((w1, w2) => w1.priority - w2.priority)[0];

	// 3.策略逻辑
	if (!curWork) {
		// workList为空，取消之前的调度
		curCallback = null;
		cbNode && cancelCallback(cbNode);
		return;
	}

	// 工作过程中产生相同优先级的work：如果优先级相同，则不需要开启新的调度。
	const { priority: curPriority } = curWork;
	if (curPriority === prevPriority) {
		return;
	}

	// 更高优先级的work
	// 取消之前优先级调度的任务，下面再去调度更高优先级的任务
	cbNode && cancelCallback(cbNode);

	// 4.满足条件，开始调度
	// scheduleCallback的返回值就是当前调度的回调函数
	// 同步方法执行完，才会在宏任务里调度perform，因此同步代码执行完，curCallback会先拿到CallbackNode，Perform在后续宏任务中执行
	// 因此在perform中schedule()后再去拿这里curCallback赋值，因为schedule同步执行完perform又在宏任务中调度，同步执行完给curCallback赋值，这时候
	// 就可以比较两次curCallback是否一致了
	curCallback = scheduleCallback(curPriority, perform.bind(null, curWork));
}

// 如果perform返回值是个函数，我们继续调度返回的函数(调度器继续调度返回的这个函数)。因此perfrom返回值为perform.bind(null, work)
// scheduler调度perform会给perfom传didtimeout参数，是否可以中断，不能中断则为同步任务
function perform(work: Work, didTimeout?: boolean) {
	// 这里是可以中断的
	// 1.work.priority同步优先级，不可以中断
	// 2.饥饿问题，如果有个work他的优先级竞争不过别人，他就一直不执行一直不执行。这样他的优先级就会越来越高越来越高直到任务过期，需要同步执行，不可以中断
	// 3.时间切片，时间切片5ms用尽了，则需要停下来，让浏览器执行渲染，当然如果一个组件特别大他的diff流程超过5ms也是正常的。因此5ms只是react规定的，超过也没办法，得等组件diff结束。
	// 3.1.时间切片是可以中断的（时间切片用尽，shouldYield为true）。等浏览器有空闲时间我们再去进行这个循环。
	// 因此是否为同步，1.同步优先级 2.didTimeout为true(任务过期了，需要同步)。
	const needSync = work.priority === ImmediatePriority || didTimeout;
	while ((needSync || !shouldYield()) && work.count) {
		work.count--;
		insertSpan(work.priority + '');
	}

	// 上面while执行完了一个work或者被中断了，就可以走到这里
	// 中断执行 || 执行完
	// 同时记录本次更新的优先级（本次更新的优先级到了下次更新就变为了pre）
	prevPriority = work.priority;

	if (!work.count) {
		// 5.work的工作完成，从workList中移除该work
		const workIndex = workList.indexOf(work);
		workList.splice(workIndex, 1);
		// 如果当前工作工作完了，重置一下prevPriority
		prevPriority = IdlePriority;
	}
	// 6.继续调度
	// 工作中仅有一个work，schedule的优化。
	// 如果perform返回值是个函数，我们继续调度返回的函数(调度器继续调度返回的这个函数)。因此perfrom返回值为perform.bind(null, work)
	// return perform.bind(null, work);

	// 先记录当前的callback
	const prevCallback = curCallback;
	// 调度一下
	schedule();

	const newCallback = curCallback;
	if (newCallback && prevCallback === newCallback) {
		// 如果callback没有变化，说明没有产生新的work，继续调度上一次的work
		// 如果callback发生变化，就不需要再返回上一次的perform方法了
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

// 耗时间
function doSomeBuzyWork(len: number) {
	let result = 0;
	while (len--) {
		result += len;
	}
}
