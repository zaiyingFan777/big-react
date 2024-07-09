import {
	FulfilledThenable,
	PendingThenable,
	Thenable
} from 'shared/ReactTypes';

export const SuspenseException = new Error(
	'这不是个真实的错误，而是Suspense工作的一部分。如果你捕获到这个错误，请将它继续抛出去'
);

// 全局变量用于保存对应的thenable
let suspendedThenable: Thenable<any> | null = null;

// 获取全局变量suspendedThenable
export function getSuspenseThenable(): Thenable<any> {
	if (suspendedThenable === null) {
		throw new Error('应该存在suspendedThenable，这是个bug');
	}
	const thenable = suspendedThenable;
	suspendedThenable = null;
	return thenable;
}

function noop() {
	// 什么都不干
}

// 将用户传进来的promise包装成thenable
export function trackUsedThenable<T>(thenable: Thenable<T>) {
	switch (thenable.status) {
		case 'fulfilled':
			return thenable.value;
		case 'rejected':
			throw thenable.reason;
		default:
			if (typeof thenable.status === 'string') {
				// 之前已经包装成thenable了，我们什么都不干
				thenable.then(noop, noop);
			} else {
				// 用户传进来的promise没有status这个字段
				// 还没有把promise包装成thenable
				// untracked的状态
				const pending = thenable as unknown as PendingThenable<T, void, any>;
				pending.status = 'pending';
				// =========================
				// const delay = (t) =>
				// 	new Promise((r) => {
				// 		setTimeout(r, t);
				// 	});
				// function fetchData(id, timeout) {
				// 	const cache = cachePool[id];
				// 	if (cache) {
				// 		return cache;
				// 	}
				// 	return (cachePool[id] = delay(timeout).then(() => {
				// 		return { data: Math.random().toFixed(2) * 100 };
				// 	}));
				// }
				// const { data } = use(fetchData(id, timeout));
				// =========================
				// pending本身就是promise实例，他在timeout时间后，会执行then方法，这里我们会把用户的这个promise包装一下，赋值promise.status属性，以及给promise实例再添加了一个then方法
				// 因此，timeout时间后，先执行用户的promise的then方法，生成新的promise实例，然后再执行我们这个赋值的then方法
				// =========================
				// const delay = (t) =>
				// 	new Promise((r) => {
				// 		setTimeout(r, t);
				// 	});
				// function fetchData(timeout) {
				// 	return delay(timeout).then(() => {
				// 				console.log('xxx')
				// 		return { data: Math.random().toFixed(2) * 100 };
				// 	})
				// }
				// var x = fetchData(10000)
				// x.then((val)=>{
				// 								console.log('th1',val)
				// 						}
				// 						, (err)=>{
				// 								console.log('th2')
				// 						}
				// 						);
				// 10s后先打印xxx，然后再打印'th1', {data: 8}
				// =========================
				pending.then(
					(val) => {
						if (pending.status === 'pending') {
							// 从pending变为fulfilled
							// @ts-ignore
							// 这里对用户传进来的promise进行操作
							const fulfilled: FulfilledThenable<T, void, any> = pending;
							fulfilled.status = 'fulfilled';
							fulfilled.value = val;
						}
					},
					(err) => {
						if (pending.status === 'pending') {
							// 从pending变为rejected
							// @ts-ignore
							const rejected: RejectedThenable<T, void, any> = pending;
							rejected.reason = err;
							rejected.status = 'rejected';
						}
					}
				);
			}
	}
	// 上面的逻辑没进去
	suspendedThenable = thenable;
	// 默认抛出自己定义的错误
	throw SuspenseException;
}
