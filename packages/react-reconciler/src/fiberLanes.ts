import {
	unstable_getCurrentPriorityLevel,
	unstable_IdlePriority,
	unstable_ImmediatePriority,
	unstable_NormalPriority,
	unstable_UserBlockingPriority
} from 'scheduler';
import { FiberRootNode } from './fiber';
import ReactCurrentBatchConfig from 'react/src/currentBatchConfig';

export type Lane = number;
export type Lanes = number;

// React并发更新会选出一批优先级，批量更新(暂时选出一个优先级)
export const NoLane = 0b00000;
export const NoLanes = 0b00000;
export const SyncLane = 0b00001; // 同步优先级
export const InputContinuousLane = 0b00010; // 连续的输入
export const DefaultLane = 0b00100; // 默认优先级
export const TransitionLane = 0b01000; // transition lane
export const IdleLane = 0b10000; // 空闲优先级

// 返回两个优先级的集合
// 0b0000 | 0b0001 => 0b0001
export function mergeLanes(laneA: Lane, laneB: Lane): Lanes {
	return laneA | laneB;
}

// 取出当前触发条件下的lane
// 我们在dispatchSetState知道是click还是useEffect触发的，因此根据触发的不同返回不同的优先级
export function requestUpdateLane(): Lane {
	// 判断transition的逻辑
	const isTransition = ReactCurrentBatchConfig.transition !== null;
	if (isTransition) {
		return TransitionLane;
	}

	// 从上下文环境中获取Scheduler优先级
	const currentSchedulerPriority = unstable_getCurrentPriorityLevel();
	// 获取当前优先级对应的lane
	const lane = schedulerPriorityToLane(currentSchedulerPriority);

	return lane;
}

/**
 * -lanes
 * 如何取反补码
 * 3的二进制是0011（这里我们使用四位二进制表示，因为3是一个小于8的数）。
 * 接下来，要找到-3的二进制表示，我们需要执行以下步骤：
 * 取反：将3的二进制表示中的所有位取反（0变成1，1变成0）。
 * 0011 -> 1100
 * 加1：在取反的基础上加1，得到补码。
 * 1100 + 0001 = 1101
 * 因此，-3的四位二进制补码表示是1101。
 *
 *  0b0011
 * &0b1101
 * =0b0001
 */

// 调度阶段选出一个lane，去调度(目前是选择最靠右的那一位)
export function getHighestPriorityLane(lanes: Lanes): Lane {
	// 1.lanes: 0b0011 我们需要返回0b0001 位数越靠右，优先级越高
	// 2.0b0110，我们返回0b0010
	// 3.0b0000 & -0b0000 => 0b0000 root.pendingLanes如果没有优先级，则取出来的是NoLane

	// a = 0b0011
	// b = -a = 0b1110
	// 因此a & -a
	//   0b0011
	// & 0b1101
	// => 1
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

/**
 * ~lane
 * 在JavaScript中，~是按位非运算符（Bitwise NOT operator）。按位非运算符会对操作数的每个位执行逻辑非操作，即将所有的1变成0，所有的0变成1。
 * 比如：var a = 0b0011; 我们想移除1
 * a &= ~1
 *   0b0011
 * & 0b1110
 * = 0b0010
 *  3:00000000000000000000000000000011
 * -3:11111111111111111111111111111100
 * -1:11111111111111111111111111111110
 */

/**
 * 按位异或 ^
 * 在JavaScript中，^ 是按位异或运算符（Bitwise XOR operator）。按位异或运算符对两个操作数的位进行逐位比较，如果两个比较的位不同，则结果位为1；如果相同，则结果位为0。
 * 0 ^ a = a
 * a ^ a = 0
 *  0b0000 0
 * ^0b0001 1
 * =0b0001 1
 *
 *  0b0001 1
 * ^0b0001 1
 * =0b0000 0
 */

// 在root.pendingLanes中移除本次更新的lane
export function markRootFinished(root: FiberRootNode, lane: Lane) {
	// var a = 0b0001
	// 取出最高优先级 a & -a => 1
	// a移除最高优先级 a &= ~1 => a: 0
	root.pendingLanes &= ~lane;

	// 还需要重置suspenededLane、pingdLane
	root.suspendedLanes = NoLanes;
	root.pingdLanes = NoLanes;
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

// 标记root里面的某个lane被挂起了
export function markRootSuspended(root: FiberRootNode, suspendedLane: Lane) {
	// 将suspendedLane标记到root.suspendedLanes中
	root.suspendedLanes |= suspendedLane;
	// 从pendingLanes中移除，添加到root.suspendedLanes中
	root.pendingLanes &= ~suspendedLane;
}

// 标记某个lane被ping了
export function markRootPinged(root: FiberRootNode, pingedLane: Lane) {
	// 将pingedLane标记到root.pingedLanes中
	// 因为我们Ping的lane是suspendedLanes（被挂起的lane的子集）,只有先挂起再ping
	root.pingdLanes |= root.suspendedLanes & pingedLane;
}

// 获取优先级中没有被挂起的或者被ping的 最高优先级lane，因为最高优先级可能被挂起了，所以需要获取再下一级的最高优先级
export function getNextLane(root: FiberRootNode): Lane {
	const pendingLanes = root.pendingLanes;

	if (pendingLanes === NoLanes) {
		return NoLane;
	}

	let nextLane = NoLane;
	// 从pendingLane中取出没有被挂起的lanes
	// 挂起的lane为root.suspendedLanes，没有被挂起的lane为~root.suspendedLanes
	// 比如：0b0001 ~0b0001 => 0b1110
	// 那么
	//   0b0011
	// & 0b1110
	// = 0b0010 这样& ~0b0001 => 从0b0011中移除了0b0001 得到 0b0010
	const suspendedLanes = pendingLanes & ~root.suspendedLanes;
	if (suspendedLanes !== NoLanes) {
		// 从没有被挂起的lanes中取出优先级最高的
		nextLane = getHighestPriorityLane(suspendedLanes);
	} else {
		// 所有的lane都被挂起了，但是我们看看是否有被ping的lane
		const pingedLanes = pendingLanes & root.pingdLanes;
		if (pingedLanes !== NoLanes) {
			// 如果pingdLanes不为空，在pingdlanes中取出最高优先级
			nextLane = getHighestPriorityLane(pingedLanes);
		}
	}
	return nextLane;
}

// 判断fiber中未执行的更新中是否包含本次更新的renderLane，如果包含就存在更新
export function includeSomeLanes(set: Lanes, subset: Lane | Lanes): boolean {
	return (set & subset) !== NoLanes;
}

// 从集合中移除某个子集或者某个子集合
export function removeLanes(set: Lanes, subet: Lanes | Lane): Lanes {
	return set & ~subet;
}
