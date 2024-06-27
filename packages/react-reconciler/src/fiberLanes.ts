import {
	unstable_getCurrentPriorityLevel,
	unstable_IdlePriority,
	unstable_ImmediatePriority,
	unstable_NormalPriority,
	unstable_UserBlockingPriority
} from 'scheduler';
import { FiberRootNode } from './fiber';

export type Lane = number;
export type Lanes = number;

// React并发更新会选出一批优先级，批量更新(暂时选出一个优先级)
export const NoLane = 0b0000;
export const NoLanes = 0b0000;
export const SyncLane = 0b0001; // 同步优先级
export const InputContinuousLane = 0b0010; // 连续的输入
export const DefaultLane = 0b0100; // 默认优先级
export const IdleLane = 0b1000; // 空闲优先级

// 返回两个优先级的集合
// 0b0000 | 0b0001 => 0b0001
export function mergeLanes(laneA: Lane, laneB: Lane): Lanes {
	return laneA | laneB;
}

// 取出当前触发条件下的lane
// 我们在dispatchSetState知道是click还是useEffect触发的，因此根据触发的不同返回不同的优先级
export function requestUpdateLane(): Lane {
	// 从上下文环境中获取Scheduler优先级
	const currentSchedulerPriority = unstable_getCurrentPriorityLevel();
	// 获取当前优先级对应的lane
	const lane = schedulerPriorityToLane(currentSchedulerPriority);

	return lane;
}

// 调度阶段选出一个lane，去调度(目前是选择最靠右的那一位)
export function getHighestPriorityLane(lanes: Lanes): Lane {
	// 1.lanes: 0b0011 我们需要返回0b0001 位数越靠右，优先级越高
	// 2.0b0110，我们返回0b0010
	// 3.0b0000 & -0b0000 => 0b0000 root.pendingLanes如果没有优先级，则取出来的是NoLane
	return lanes & -lanes;
}

// 计算update的时候，如何确保优先级足够，简单的比较数值大小太局限了
export function isSubsetOfLanes(set: Lanes, subset: Lane) {
	// lane 是否在lanes中，代表他的优先级足够，不在就说明优先级不够。
	// 取交集，比如0b0100和0b0001，就没有交集，就说明优先级不够。
	// var a = 0b0100
	// var b = 0b0001
	// (a & b) === b; => false
	// 让a为：var a = 0b0011，这时候(a & b) === b; => true
	return (set & subset) === subset;
}

// 在root.pendingLanes中移除本次更新的lane
export function markRootFinished(root: FiberRootNode, lane: Lane) {
	// var a = 0b0001
	// 取出最高优先级 a & -a => 1
	// a移除最高优先级 a &= ~1 => a: 0
	root.pendingLanes &= ~lane;
}

// 将Lane(react)转为调度器的优先级
export function lanesToSchedulerPriority(lanes: Lanes) {
	const lane = getHighestPriorityLane(lanes);
	if (lane === SyncLane) {
		return unstable_ImmediatePriority;
	}
	if (lane === InputContinuousLane) {
		return unstable_UserBlockingPriority;
	}
	if (lane === DefaultLane) {
		return unstable_NormalPriority;
	}
	return unstable_IdlePriority;
}

// 将调度器的优先级转为lane(react)
export function schedulerPriorityToLane(schedulerPriority: number): Lane {
	if (schedulerPriority === unstable_ImmediatePriority) {
		return SyncLane;
	}
	if (schedulerPriority === unstable_UserBlockingPriority) {
		return InputContinuousLane;
	}
	if (schedulerPriority === unstable_NormalPriority) {
		return DefaultLane;
	}
	return NoLane;
}
