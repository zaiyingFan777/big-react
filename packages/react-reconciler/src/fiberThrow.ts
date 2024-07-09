import { Wakeable } from 'shared/ReactTypes';
import { FiberRootNode } from './fiber';
import { Lane, markRootPinged } from './fiberLanes';
import { ensureRootIsScheduled, markRootUpdated } from './workLoop';
import { getSuspenseHandler } from './suspenseContext';
import { ShouldCapture } from './fiberFlags';

// 请求返回后重新触发更新
export function throwException(root: FiberRootNode, value: any, lane: Lane) {
	// Error Boundray

	// thenable
	if (
		value !== null &&
		typeof value === 'object' &&
		typeof value.then === 'function'
	) {
		const wakebale: Wakeable<any> = value;

		// 获取suspense栈顶的第一个，并标记flag，为了后续unwind的时候找到这个标记的suspense
		const suspenseBoundary = getSuspenseHandler();
		if (suspenseBoundary) {
			suspenseBoundary.flags |= ShouldCapture;
		}

		// ping一下
		attachPingListener(root, wakebale, lane);
	}
}

// 挂起后，请求结果返回，触发更新，才能渲染新的状态
function attachPingListener(
	root: FiberRootNode,
	wakeable: Wakeable<any>,
	lane: Lane
) {
	// wakeable.then(ping, ping)
	let pingCache = root.pingCache; // pingCache: WeakMap<Wakeable<any>, Set<Lane>> | null; WeakMap{promise: Set<Lane>}
	// lane的集合，每一个lane代表了可以ping的suspense(可唤醒wakeable的更新(lane))
	let threadIDs: Set<Lane> | undefined;

	// WeakMap{ wakeable: Set[lane1, lane2, ...]}
	if (pingCache === null) {
		// 没有缓存，则把更新加入到缓存里
		threadIDs = new Set<Lane>();
		// 连续赋值先从右边的等号开始，并且pingCache和root.pingCache指向的是同一个WeakMap对象
		pingCache = root.pingCache = new WeakMap<Wakeable<any>, Set<Lane>>();
		pingCache.set(wakeable, threadIDs);
	} else {
		// 缓存存在
		threadIDs = pingCache.get(wakeable);
		if (threadIDs === undefined) {
			threadIDs = new Set<Lane>();
			pingCache.set(wakeable, threadIDs);
		}
	}

	// 判断是不是第一次进入，只有是第一次进入才需要调用wakeable的then方法
	if (!threadIDs.has(lane)) {
		// 第一次进入
		threadIDs.add(lane);

		// 触发一次新的更新
		function ping() {
			console.warn('ping!!!');
			if (pingCache !== null) {
				pingCache.delete(wakeable);
			}
			// 将之前挂起的lane记录到fiberRootNode的pingdLanes上
			markRootPinged(root, lane);
			// 将lane记录到fiberRootNode的pendingLanes上
			markRootUpdated(root, lane);
			// 选出一个lane去更新
			ensureRootIsScheduled(root);
		}
		// 并调用wakeable的then方法
		// wake已经被包装了一层了，这里给包装的wakeable返回的promise实例又添加了个then方法，这个then会先执行完前面的then再执行这个
		// 给wakeable的最后添加了then方法，执行这个then就会触发新的更新流程，而且promise.value也是可以在新的更新流程中拿到
		wakeable.then(ping, ping);
	}
}
