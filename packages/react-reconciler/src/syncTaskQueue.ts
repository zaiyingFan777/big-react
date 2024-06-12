// 同步任务
let syncQueue: ((...args: any) => void)[] | null = null;
// 当前是否正在执行微任务
let isFlushingSyncQueue = false;

// 调度同步任务
export function scheduleSyncCallback(callback: (...args: any) => void) {
	if (syncQueue === null) {
		syncQueue = [callback];
	} else {
		syncQueue.push(callback);
	}
}

// 执行
export function flushSyncCallbacks() {
	if (!isFlushingSyncQueue && syncQueue) {
		// 当前没有执行微任务，并且微任务存在
		isFlushingSyncQueue = true;
		try {
			syncQueue.forEach((callback) => callback());
		} catch (e) {
			if (__DEV__) {
				console.error('flushSyncCallbacks报错', e);
			}
		} finally {
			// 重置变量
			isFlushingSyncQueue = false;
			// 清空微任务队列
			syncQueue = null;
		}
	}
}
