import { FiberRootNode } from './fiber';

// lane：二进制的数字，作为update的优先级
export type Lane = number;
// lanes作为lane的集合
export type Lanes = number;

// Batched Updates批处理
// react同步更新的批处理：微任务，开启并发更新（useTransition）：宏任务，选择一批优先级去更新
// vue、svelte批处理：微任务

// 代表同步的优先级
// 优先级数字越小 优先级越高
export const SyncLane = 0b0001; // 1
// 代表没有优先级
export const NoLane = 0b0000;
export const NoLanes = 0b0000;

export function mergeLanes(laneA: Lane, laneB: Lane): Lanes {
	// 按位或：对于每一个比特位，当两个操作数相应的比特位至少有一个1时，结果为1，否则为0。
	return laneA | laneB;
}

export function requestUpdateLane() {
	// 根据触发的方式不同返回不同的优先级
	return SyncLane;
}

// 通过某些机制，选出一个lane
// 获取优先级最高的lane
export function getHighestPriorityLane(lanes: Lanes): Lane {
	// 我们传入的是fiberRootNode的pendingLanes假设为0b0011，返回的是0b0001
	// 我们传入的是fiberRootNode的pendingLanes假设为0b0110，返回的是0b0010
	return lanes & -lanes;
}

// 移除lanes集合中的lane
export function markRootFinished(root: FiberRootNode, lane: Lane) {
	root.pendingLanes &= ~lane;
}
