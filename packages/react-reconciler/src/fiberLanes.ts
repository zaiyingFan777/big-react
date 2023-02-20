import {
	unstable_IdlePriority,
	unstable_ImmediatePriority,
	unstable_NormalPriority,
	unstable_UserBlockingPriority,
	unstable_getCurrentPriorityLevel
} from 'scheduler';
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
// 连续的输入，比如拖拽，点击事件属于离散的
export const InputContinuousLane = 0b0010; // 2
export const DefaultLane = 0b0100; // 4
// 空闲的
export const IdleLane = 0b1000; // 8
// 代表没有优先级
export const NoLane = 0b0000;
export const NoLanes = 0b0000;

export function mergeLanes(laneA: Lane, laneB: Lane): Lanes {
	// 按位或：对于每一个比特位，当两个操作数相应的比特位至少有一个1时，结果为1，否则为0。
	return laneA | laneB;
}

export function requestUpdateLane() {
	// 从上下文环境中获取Scheduler优先级，如果是首屏渲染获取的是默认的优先级,点击事件是同步的，修改当前环境的优先级为同步，然后setState的时候调用此方法，获取优先级为同步
	const currentSchedulerPriority = unstable_getCurrentPriorityLevel();
	// 将当前的Scheduler优先级转换为lane
	const lane = schedulerPriorityToLane(currentSchedulerPriority);
	return lane;
}

// 通过某些机制，选出一个lane
// 获取优先级最高的lane
export function getHighestPriorityLane(lanes: Lanes): Lane {
	// 我们传入的是fiberRootNode的pendingLanes假设为0b0011，返回的是0b0001
	// 我们传入的是fiberRootNode的pendingLanes假设为0b0110，返回的是0b0010
	return lanes & -lanes;
}

// 判断优先级是否足够
export function isSubsetOfLanes(set: Lanes, subset: Lane) {
	// lane在lanes中说明优先级足够，不在则为优先级不够
	// ps: var a = 0b0000; a |= 0b1000(8) => a = 8;
	// a |= 0b0001(1); a => 9; (a & 0b0010)[0b0010为2] === 0b0010 => false; (a & 0b0010) => 0;
	// (a & 0b0001) === 0b0001 => true
	// 其实就是如果我们的set当前为8空闲，新来了一个1同步，8 & 1 !== 1 ，为0，说明优先级1(subset)不足够
	// x & 0b0000 === 0b0000，所以对于任何数字 & 0b0000 都为 0
	return (set & subset) === subset;
}

// 移除lanes集合中的lane
export function markRootFinished(root: FiberRootNode, lane: Lane) {
	root.pendingLanes &= ~lane;
}

// scheduler中的5种优先级
// react中的lane模型
// 他两个是解耦的

// 从lane转到scheduler的优先级
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

// 从调度器的优先级转换为Lane
export function schedulerPriorityToLane(schedulerPriority: number) {
	if (schedulerPriority === unstable_ImmediatePriority) {
		return SyncLane;
	}
	if (schedulerPriority === unstable_UserBlockingPriority) {
		return InputContinuousLane;
	}
	if (schedulerPriority === unstable_NormalPriority) {
		return DefaultLane;
	}
	return NoLane; // unstable_IdlePriority
}
