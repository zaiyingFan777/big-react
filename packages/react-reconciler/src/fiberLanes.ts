import { FiberRootNode } from './fiber';

export type Lane = number;
export type Lanes = number;

// React并发更新会选出一批优先级，批量更新(暂时选出一个优先级)
export const NoLane = 0b0000;
export const NoLanes = 0b0000;
export const SyncLane = 0b0001; // 同步优先级

// 返回两个优先级的集合
// 0b0000 | 0b0001 => 0b0001
export function mergeLanes(laneA: Lane, laneB: Lane): Lanes {
	return laneA | laneB;
}

// 取出当前触发条件下的lane
// 我们在dispatchSetState知道是click还是useEffect触发的，因此根据触发的不同返回不同的优先级
export function requestUpdateLane(): Lane {
	return SyncLane;
}

// 调度阶段选出一个lane，去调度(目前是选择最靠右的那一位)
export function getHighestPriorityLane(lanes: Lanes): Lane {
	// 1.lanes: 0b0011 我们需要返回0b0001 位数越靠右，优先级越高
	// 2.0b0110，我们返回0b0010
	// 3.0b0000 & -0b0000 => 0b0000 root.pendingLanes如果没有优先级，则取出来的是NoLane
	return lanes & -lanes;
}

// 在root.pendingLanes中移除本次更新的lane
export function markRootFinished(root: FiberRootNode, lane: Lane) {
	// var a = 0b0001
	// 取出最高优先级 a & -a => 1
	// a移除最高优先级 a &= ~1 => a: 0
	root.pendingLanes &= ~lane;
}
