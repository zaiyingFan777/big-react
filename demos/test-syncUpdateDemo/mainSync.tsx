import './style.css';

const button = document.querySelector('button');
const root = document.querySelector('#root');

// 同步示例
// 交互产生work -> 插入到workList
// schedule -> 调度出work，交给perform(类比react中的render阶段，beginwork、completework)，perform执行完继续调度。
// 这里是同步调用，button click之后回调函数进入调用栈，多点几次，回调都会进入同步调用栈。执行完一个再执行另一个
// 如果点击两次 打印顺序为 111 222 111 111 222 111
// 因为button click执行回调，将work放到workList里，然后执行schedule，打印111，因为workList不为空，接着打印222，同步执行完perform（在最后执行schedule，打印111，因为这时候workList为空），
// 紧接着执行同步调用栈中第二个click回调，work进入到workList，执行schedule，打印111，workList不为空，打印222，同步执行完perform(在最后执行schedule，打印111，因为这时候workList为空)，结束。
interface Work {
	count: number; // 某个工作要执行的次数，类比react中组件的数量
}

const workList: Work[] = [];

// 2.调度阶段调度任务
function schedule() {
	console.log('11111111');
	// 3.调度出work
	const curWork = workList.pop();
	// 4.render、commit
	if (curWork) {
		console.log('2222222');
		perform(curWork);
	}
}

function perform(work: Work) {
	while (work.count) {
		work.count--;
		insertSpan('0');
	}
	// 5.继续调度
	schedule();
}

function insertSpan(content) {
	const span = document.createElement('span');
	span.innerText = content;
	root?.appendChild(span);
}

// 1.交互触发更新
button &&
	(button.onclick = () => {
		workList.unshift({
			count: 100
		});
		schedule();
	});
