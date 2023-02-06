// 保存同步调度的逻辑

// 保存同步回调函数的数组
let syncQueue: ((...args: any) => void)[] | null = null;
let isFlushingSyncQueue = false;

// 调度同步回调函数
export function scheduleSyncCallback(callback: (...args: any) => void) {
	if (syncQueue === null) {
		// 说明callback是同步调度的第一个回调函数
		syncQueue = [callback];
	} else {
		syncQueue.push(callback);
	}
}

// 执行
export function flushSyncCallbacks() {
	if (!isFlushingSyncQueue && syncQueue) {
		isFlushingSyncQueue = true;
		try {
			// 执行同步回调
			syncQueue.forEach((callback) => callback());
			syncQueue = null;
		} catch (e) {
			if (__DEV__) {
				console.error('flushSyncCallbacks报错', e);
			}
		} finally {
			isFlushingSyncQueue = false;
		}
	}
}
