import {
	FulfilledThenable,
	PendingThenable,
	RejectedThenable,
	Thenable
} from 'shared/ReactTypes';

export const SuspenseException = new Error(
	'这不是个真实的错误，而是Suspense工作的一部分。如果你捕获到这个错误，请将它继续抛出去'
);

// 全局变量保存thenable
let suspendedThenable: Thenable<any> | null = null;

// 获取当前use返回的thenable
export function getSuspenseThenable(): Thenable<any> {
	if (suspendedThenable === null) {
		throw new Error('应该存在suspendedThenable，这是个bug');
	}
	const thenable = suspendedThenable;
	suspendedThenable = null;
	return thenable;
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
function noop() {}

export function trackUsedThenable<T>(thenable: Thenable<T>) {
	switch (thenable.status) {
		// 需要自己定义
		case 'fulfilled':
			return thenable.value;
		// 需要自己定义
		case 'rejected':
			throw thenable.reason;
		default:
			if (typeof thenable.status === 'string') {
				// 如果之前包装过了，那么什么也不需要做
				thenable.then(noop, noop);
			} else {
				// 用户传进来的promise没有包装过，我们包装一下
				// untracked
				const pending = thenable as unknown as PendingThenable<T, void, any>;
				pending.status = 'pending';
				pending.then(
					(val) => {
						if (pending.status === 'pending') {
							// @ts-ignore
							const fulfilled: FulfilledThenable<T, void, any> = pending;
							fulfilled.status = 'fulfilled';
							fulfilled.value = val;
						}
					},
					(err) => {
						if (pending.status === 'pending') {
							// @ts-ignore
							const rejected: RejectedThenable<T, void, any> = pending;
							rejected.reason = err;
							rejected.status = 'rejected';
						}
					}
				);
			}
	}
	suspendedThenable = thenable;
	throw SuspenseException;
}
