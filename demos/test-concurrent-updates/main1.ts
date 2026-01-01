import './style.css';
// 同步示例
const button = document.querySelector('button');
const root = document.querySelector('#root');

interface Work {
	count: number; // 代表某个工作要执行的次数，类比react组件的数量
}

// workList类比于微任务队列
const workList: Work[] = [];

// 调度流程，会选出work
function schedule() {
	const curWork = workList.pop();

	if (curWork) {
		perform(curWork);
	}
}

// perform类比react中beginwork和completework的流程
function perform(work: Work) {
	while (work.count) {
		work.count--;
		insertSpan('0');
	}
	// 继续调度
	schedule();
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

// 点击按钮
// 1.往workList插入work,
button &&
	(button.onclick = () => {
		workList.unshift({
			count: 100
		});
		schedule();
	});
