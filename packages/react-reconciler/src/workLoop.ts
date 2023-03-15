// 完整的工作循环，调用beginWork和completeWork
import { scheduleMicroTask } from 'hostConfig';
import { beginWork } from './beginWork';
import {
	commitHookEffectListCreate,
	commitHookEffectListDestory,
	commitHookEffectListUnmount,
	commitMutationEffects
} from './commitWork';
import { completeWork } from './completeWork';
import {
	FiberNode,
	FiberRootNode,
	PendingPassiveEffects,
	createWorkInProgress
} from './fiber';
import { MutationMask, NoFlags, PassiveMask } from './fiberFlags';
import {
	Lane,
	NoLane,
	SyncLane,
	getHighestPriorityLane,
	lanesToSchedulerPriority,
	markRootFinished,
	mergeLanes
} from './fiberLanes';
import { flushSyncCallbacks, scheduleSyncCallback } from './syncTaskQueue';
import { HostRoot } from './workTags';
import {
	unstable_scheduleCallback as scheduleCallback,
	unstable_NormalPriority as NormalPriority, // 优先级
	unstable_shouldYield,
	unstable_cancelCallback
} from 'scheduler';
import { HookHasEffect, Passive } from './hookEffectTags';

// 全局的指针指向当前正在工作的fiberNode
let workInProgress: FiberNode | null = null;
// 保存：本次更新的lane是什么
let wipRootRenderLane: Lane = NoLane;
// 控制commitRoot阶段调度副作用的变量
let rootDoesHasPassiveEffect = false;

// 区分被中断还是render阶段执行完
type RootExitStatus = number;
// 中断执行
const RootInComplete = 1;
// render执行完
const RootCompleted = 2;
// TODO 执行过程种报错了

// 一些感悟：
// function App() {
// 	const [num, update] = useState(100);
// 	return (
// 		<ul onClick={() => update(50)}>
// 			{new Array(num).fill(0).map((_, i) => {
// 				return <Child key={i}>{i}</Child>;
// 			})}
// 		</ul>
// 	);
// }
// function Child({ children }) {
// 	const now = performance.now();
// 	while (performance.now() - now < 4) {}
// 	return <li>{children}</li>;
// }
// 我们app组件执行后会根据state的值返回jsx然后被我们的jsx方法生成reactElement，然后这个renderWithHook会生成children这个children就是我们的Child组件的数组，然后接着执行render过程，
// 其实每次render都是产生的fiberNode赋值给workInProgress变量，所以我们就是打断的子组件的render，

// 暂定一帧不是一次事件循环，如果没有渲染的条件，那就在这一帧进入下一次事件循环
// 我们一次事件循环可以执行一次宏任务，并且会执行尝试去执行渲染，但是是否渲染靠一些其他条件限制，刷新频率，当前tab是否激活等。在可以执行渲染的情况下(能不能渲染，由这一帧到没到时间控制)，执行raf.如果不能执行渲染，就进入下一次事件循环
// (js没有事件循环这个概念，event loop是runtime提供的), 我们的react scheduler通过messageChannel和postmessage向
// 宏任务队列推调度函数(我们的render就是在这里的),为什么不用settimeout 0，哪怕是0两个settimeout 0之间的间隙也有4ms左右，所以我们react向浏览器申请5ms的时间切片，当然如果这次render任务特别重超过了16.6ms，那么就会影响浏览器的渲染
// 当我们申请的切片也就是宏任务被执行的时候，如果执行完了 将控制权交给渲染进程，如果还有时间，理论上执行3-4个时间切片，所以我们申请时间切片messageChannel和postmessage，然后浏览器自己有空闲时间才去调用我们的这个任务，否则他自己去
// 执行渲染。
// 为什么用宏任务模拟requestIdleCallback?宏任务是在下次事件循环中执行，不会阻塞浏览器更新。而且浏览器一次只会执行一个宏任务。首先看一下两种满足情况的宏任务
// !!!todo如果通过优先级去做我们自己的任务调度 这个需要继续学习！！！

// Scheduler的时间切片功能是通过task（宏任务）实现的(把render函数以及优先级放到scheduleCallback中，就是把render过程放到宏任务中去执行)。MessageChannel、setTimeout。
// 时间切片的本质是模拟实现requestIdleCallback
// 除去“浏览器重排/重绘”，下图是浏览器一帧中可以用于执行JS的时机。
// 下面是一次事件循环
// 一个task(宏任务) -- 队列中全部job(微任务) -- requestAnimationFrame -- 浏览器重排/重绘 -- requestIdleCallback   (ps:这里面每个都是宏任务)
// requestIdleCallback是在“浏览器重排/重绘”后如果当前帧还有空余时间时被调用的。这样我们利用空闲时间，去执行我们的render，没有空闲时间就把线程交给渲染进程

// ps: 帧
// 在每16.6ms时间内，需要完成如下工作：
// JS脚本执行 -----  样式布局 ----- 样式绘制(我们知道，JS可以操作DOM，GUI渲染线程与JS线程是互斥的。所以JS脚本执行和浏览器布局、绘制不能同时执行。)
// 当JS执行时间过长，超出了16.6ms，这次刷新就没有时间执行样式布局和样式绘制了。
// 如何解决? 在浏览器每一帧的时间中，预留一些时间给JS线程，React利用这部分时间更新组件（可以看到，在源码中，预留的初始时间是5ms）。
// 当预留的时间不够用时，React将线程控制权交还给浏览器使其有时间渲染UI，React则等待下一帧时间到来继续被中断的工作。
// 帧 是 浏览器的概念， 5ms 是 react的规定
// 一帧大概是 16.6ms ， 里面可能包含1～多个宏任务
// react一个切片是5ms，所以理论上一帧会执行4个左右切片
// 如果某些组件render逻辑复杂，可能一个切片就大于 16.6ms， 那么一帧就一个切片
// react 5ms中断一次，为了让浏览器看看这一帧用完没，没用完下个5ms还是同一帧

// 在同步操作比如commitRoot的时候，点击事件触发，这个点击事件的回调会在commitRoot之后执行，相当于回调加入了任务队列进入了事件循环
// ps:
// <div id="xxx">111111111111</div>
// document.getElementById('xxx').addEventListener('click', () => {
//   console.log(1111111111)
// })
// var count = 0;
// while(count <= 3) {
//   sleep(1000)
//   count++;
//   console.log(count)
// }

// function sleep(time){
//   var timeStamp = new Date().getTime();
//   var endTime = timeStamp + time;
//   while(true){
//     if (new Date().getTime() > endTime){
//       return;
//     }
//   }
// }
// 我们在同步代码没执行完前点击div，会等着while循环结束再打印1111111111

// 执行初始化的操作
function prepareFreshStack(root: FiberRootNode, lane: Lane) {
	// 如果有更高优先级的打断，我们会重新创建一颗workInProgress树，如果是同一优先级就不会走到这里，继续之前的wip render
	// 如果高优先级执行完，再次回到调度低优先级的时候，会重新构建一颗workInProgress树，打断了，高优先级执行完，仍然会执行低优先级的任务
	root.finishedLane = NoLane;
	root.finishedWork = null;
	// FiberRootNode不是一个普通的fiberNode不能直接当作workInProgress，因此需要一个方法将fiberRootNode变为fiberNode
	// 为我们的hostRootFiber创建一个workInProgress
	workInProgress = createWorkInProgress(root.current, {});
	wipRootRenderLane = lane;
}

// 连接ReactDOM.createRoot().render()中的render调用的updateContainer方法与renderRoot方法
// !!!每次更新都会触发scheduleUpdateOnFiber函数,
// !!!ps: 如果我们在一次click事件中，调用三次setNum((num) => num + 1);这时候会将performSyncWorkOnRoot方法放到syncQueue中三次，也就是数组中有三个performSyncWorkOnRoot，因为scheduleMicroTask
// 是微任务，所以是异步的，先执行同步，因此会第一次setNum((num) => num + 1)将performSyncWorkOnRoot放到数组中，执行scheduleMicroTask进入微任务队列，这是异步，然后接着执行setNum((num) => num + 1);
// 然后再将performSyncWorkOnRoot放到数组中，执行scheduleMicroTask进入微任务队列，然后第三次执行setNum((num) => num + 1)再将performSyncWorkOnRoot放到数组中，然后同步任务完成后，执行flushSyncCallbacks方法(微任务)，起了三次微任务
// 但是我们第一次的时候才会清空syncQueue数组，然后，执行performSyncWorkOnRoot函数，在render阶段完成后(计算state的时候，环状链表执行完计算出三次setState的结果)，在commit的时候，将root.pendingLanes &= ~lane，将这次执行的任务(同步Lane)
// 移除掉，因此下两次的performSyncWorkOnRoot函数里再取优先级就已经没有了，也不会执行了，因此setState三次，取出同步Lane只执行一次performSyncWorkOnRoot。如果有其他的优先级就调度其他的优先级了
export function scheduleUpdateOnFiber(fiber: FiberNode, lane: Lane) {
	// TODO调度功能
	// 1.首屏渲染传进来的时hostRootFiber，2.对于其他更新流程传入的是class component或者function component对应的fiber

	// 根据当前fiber一直往上遍历到 fiberRootNode
	// 拿到fiberRootNode
	const root = markUpdateFromFiberToRoot(fiber);
	markRootUpdated(root, lane);
	ensureRootIsScheduled(root);
}

// schedule阶段入口（保证我们的root被调度）
function ensureRootIsScheduled(root: FiberRootNode) {
	// 获取当前优先级最高的的lane
	const updateLane = getHighestPriorityLane(root.pendingLanes);
	const existingCallback = root.callbackNode;

	if (updateLane === NoLane) {
		// NoLane代表了当前root.pendingLanes没有lane,就对应的没有Update更新
		if (existingCallback !== null) {
			// worklist为空 取消之前调度，
			unstable_cancelCallback(existingCallback);
		}
		root.callbackNode = null;
		root.callbackPriority = NoLane;
		return;
	}

	const curPriority = updateLane;
	const prevPriority = root.callbackPriority;

	// 如果前后优先级相同，不需要产生新的调度
	if (curPriority === prevPriority) {
		return;
	}

	if (existingCallback !== null) {
		// 如果当前优先级高，取消之前的调度
		unstable_cancelCallback(existingCallback);
	}

	let newCallbackNode = null;

	if (updateLane === SyncLane) {
		// 同步优先级 用微任务调度
		if (__DEV__) {
			console.log('在微任务中调度，优先级：', updateLane);
		}
		// 比如下面的点击事件会触发三个更新
		// const onClick = () => {
		// 	// 创建3个update
		// 	updateCount((count) => count + 1);
		// 	updateCount((count) => count + 1);
		// 	updateCount((count) => count + 1);
		// };
		// 每触发一次更新数组多一个回调
		// 得到[performSyncWorkOnRoot, performSyncWorkOnRoot, performSyncWorkOnRoot]
		// 每次更行都会将performSyncWorkOnRoot放到数组里[performSyncWorkOnRoot, performSyncWorkOnRoot]
		scheduleSyncCallback(performSyncWorkOnRoot.bind(null, root, updateLane));
		// 会在微任务中执行三次flushSyncCallbacks，但是只会进第一次，因为有全局变量isFlushingSyncQueue，后边两次都直接执行以下就退出了
		scheduleMicroTask(flushSyncCallbacks);
	} else {
		// 其他优先级 用宏任务调度
		// 宏任务调度
		// 获取lane，将lane转为scheduler优先级
		const schedulerPriority = lanesToSchedulerPriority(updateLane);
		newCallbackNode = scheduleCallback(
			schedulerPriority,
			// @ts-ignore
			performConcurrentWorkOnRoot.bind(null, root)
		);
	}

	root.callbackNode = newCallbackNode;
	root.callbackPriority = curPriority;
}

// 传入update后，在scheduleUpdateOnFiber中将lane记录到fibeRootNode中的lane集合中，然后调度，完成更新，接着如果仍然有需要执行的lane通过调度继续更新直到，fiberRootNode中的lane集合都被调度执行完毕
function markRootUpdated(root: FiberRootNode, lane: Lane) {
	// 将本次更新的lane记录到fibeRootNode上的lane集合中
	root.pendingLanes = mergeLanes(root.pendingLanes, lane);
}

// 根据当前fiber一直往上遍历到 fiberRootNode
function markUpdateFromFiberToRoot(fiber: FiberNode) {
	let node = fiber;
	let parent = node.return;
	while (parent !== null) {
		node = parent;
		parent = node.return;
	}
	// 普通fiber跳出循环后,到达了hostRootFiber
	if (node.tag === HostRoot) {
		return node.stateNode;
	}
	return null;
}

// 并发更新，可中断render
function performConcurrentWorkOnRoot(
	root: FiberRootNode,
	didTimeout: boolean
): any {
	// useEffect的执行可能会触发更新，需要判断下useEffect的优先级跟当前的优先级谁高
	// 保证useEffect回调执行
	const curCallback = root.callbackNode;
	const didFlushPassiveEffect = flushPassiveEffects(root.pendingPassiveEffects);
	if (didFlushPassiveEffect) {
		// useEffect执行了，触发了更新，会产生新的callback
		if (root.callbackNode !== curCallback) {
			// 有更高优先级的调度
			return null;
		}
	}

	// 获取最高优先级
	const lane = getHighestPriorityLane(root.pendingLanes);
	const curCallbackNode = root.callbackNode;
	if (lane === NoLane) {
		return null;
	}
	// 是否需要同步更新
	const needSync = lane === SyncLane || didTimeout;
	// render阶段 needSync同步，!needSync就是不应该同步，即时间切片
	const exitStatus = renderRoot(root, lane, !needSync);

	// 重新调度
	ensureRootIsScheduled(root);

	if (exitStatus === RootInComplete) {
		// 中断
		if (root.callbackNode !== curCallbackNode) {
			// 说明有更高优先级的更新
			return null;
		}
		// 如果root.callbackNode === curCallbackNode，说明是同一work被中断
		return performConcurrentWorkOnRoot.bind(null, root);
	}

	if (exitStatus === RootCompleted) {
		// 更新完毕
		// render阶段完成
		// 获取工作完毕后的wip fiberNode树
		const finishedWork = root.current.alternate;
		root.finishedWork = finishedWork;
		// 本次更新的lane
		root.finishedLane = lane;
		// 本次更新结束以后更新为NoLane
		wipRootRenderLane = NoLane;

		// 执行commit操作
		// wip fiberNode树以及树中的flags 执行具体的dom操作
		commitRoot(root);
	} else if (__DEV__) {
		console.error('还未实现并发更新结束状态');
	}
}

// mount流程：1.生成wip fiberNode树 2.标记副作用的flags
// 更新流程的步骤：递: beginWork 归: completeWork

// renderRoot会执行更新的过程(更新流程)
// 调用renderRoot的是触发更新的api: 1.首屏渲染：ReactDOM.createRoot().render(或者老版本的ReactDOM.render) 2.this.setState 3.useState的dispatch方法
// 这就是renderRoot函数
function performSyncWorkOnRoot(root: FiberRootNode) {
	const nextLane = getHighestPriorityLane(root.pendingLanes);

	if (nextLane !== SyncLane) {
		// 其他比SyncLane低的优先级
		// NoLane
		ensureRootIsScheduled(root);
		return;
	}

	// 得到退出的状态
	const exitStatus = renderRoot(root, nextLane, false);

	if (exitStatus === RootCompleted) {
		// render阶段完成
		// 获取工作完毕后的wip fiberNode树
		const finishedWork = root.current.alternate;
		root.finishedWork = finishedWork;
		// 本次更新的lane
		root.finishedLane = nextLane;
		// 本次更新结束以后更新为NoLane
		wipRootRenderLane = NoLane;

		// 执行commit操作
		// wip fiberNode树以及树中的flags 执行具体的dom操作
		commitRoot(root);
	} else if (__DEV__) {
		console.error('还未实现同步更新结束状态');
	}
}

function renderRoot(root: FiberRootNode, lane: Lane, shouldTimeSlice: boolean) {
	// shouldTimeSlice: boolean是否需要时间切片
	if (__DEV__) {
		console.log(
			`render阶段开始，开始${shouldTimeSlice ? '并发' : '同步'}更新`,
			root
		);
	}

	// 并发更新可能会被中断再继续，所以不是每一次render都需要初始化
	if (wipRootRenderLane !== lane) {
		// 初始化 wip、wipRootRenderLane
		prepareFreshStack(root, lane);
	}

	// do while无论如何都会先执行一次循环体
	do {
		try {
			shouldTimeSlice ? workLoopConcurrent() : workLoopSync();
			// 这里的break可能是执行完毕、中断、抛出错误
			break;
		} catch (e) {
			if (__DEV__) {
				// 开发环境下的包提示报错信息，生产环境不会 __DEV__编译为false, 开发环境编译为true
				console.warn('workLoop发生错误', e);
			}
			workInProgress = null;
		}
	} while (true);

	// 中断执行 || render阶段执行完
	// 中断执行
	if (shouldTimeSlice && workInProgress !== null) {
		// 工作没有执行完
		return RootInComplete;
	}
	// render阶段执行完
	if (!shouldTimeSlice && workInProgress !== null && __DEV__) {
		console.error('render阶段结束时，wip不应该不为null');
	}
	// TODO报错
	return RootCompleted;
}

// commit阶段的3个子阶段
// beforeMutation阶段
// mutation阶段
// layout阶段

// 当前commit阶段要执行的任务：
// 1.fiber树的切换(将生成的wip渲染到页面上后，将wip变为current，下次有更新又会生成一颗新的wip) 发生在mutation完成 layout之前
// 2.执行Placement对应操作
function commitRoot(root: FiberRootNode) {
	const finishedWork = root.finishedWork; // wip 根节点<App/>即hostRootFiber对应的wip

	if (finishedWork === null) {
		return;
	}

	if (__DEV__) {
		console.warn('commit阶段开始', finishedWork);
	}
	// 拿到本次更新的lane
	const lane = root.finishedLane;

	if (lane === NoLane && __DEV__) {
		console.error('commit阶段finishedLane不应该是NoLane');
	}

	// 重置
	root.finishedWork = null;
	// 重置本次更新的lane
	root.finishedLane = NoLane;

	// 移除本次更新的lane
	markRootFinished(root, lane);

	// 当前的fiber树中是存在函数组件要执行useEffect回调的
	if (
		(finishedWork.flags & PassiveMask) !== NoFlags ||
		(finishedWork.subtreeFlags & PassiveMask) !== NoFlags
	) {
		// 防止多次执行commitRoot的时候执行多次调度副作用的操作
		if (!rootDoesHasPassiveEffect) {
			rootDoesHasPassiveEffect = true;
			// 调度副作用，调度我们第二个参数这个回调函数，这个回调函数会在setTimeout里面被调度，调度的优先级是NormalPriority
			scheduleCallback(NormalPriority, () => {
				// 执行副作用(异步)
				flushPassiveEffects(root.pendingPassiveEffects);
				return;
			});
		}
	}

	// 判断是否存在3个子阶段需要执行的操作
	// 1.root flags 2.root subtreeFlags
	// 解决deps变化不再更新的问题
	// 这里解决了useEffect回调不收集的情况，因为effect是在commit阶段塞到root.pendingPassiveEffects里的，下面的不加的话，就无法进入commit阶段了
	const subtreeHasEffect =
		(finishedWork.subtreeFlags & (MutationMask | PassiveMask)) !== NoFlags; // 我有插入操作 a = 0; a |= 2;（a为2） a & MutationMask(22) => 2，如果我没有标记 0 & 22 => 0(NoFlags)
	const rootHasEffect =
		(finishedWork.flags & (MutationMask | PassiveMask)) !== NoFlags;

	// root的subtreeFlags或者flags是否包含MutationMask指定的flag，如果包含，代表当前存在mutation执行的操作
	if (subtreeHasEffect || rootHasEffect) {
		// beforeMutation阶段

		// mutation阶段 Placement，包含了收集副作用
		commitMutationEffects(finishedWork, root);
		// fiber树的切换
		// !!!注意，初次mount的时候，hostRootFiber.alternate就是workInProgress，我们先给workInProgress构建出来一整棵树，然后在commit过程切换，将root.current变为workInProgress成为了current，
		// 这时候current.alternate就变为了最初没有子节点没有被处理的hostRootFiber
		// !!!注意，第一次update调用setState的时候，hostRootFiber(current)的alternate(child为null)是存在的，然后createWorkInProgress wip是存在的，但是他的可以复用的子节点useFiber->createWorkInProgress 子节点的alternate都为null(这种仅限于更新内容没有删除新增操作)，需要在createWorkInProgress重新建立FiberNode
		// !!!注意，第二次update调用setState的时候，只要是更新，所有的current的alternate都是可以复用的就不会再执行createWorkInProgress
		// TODO
		root.current = finishedWork;

		// layout阶段
	} else {
		// 不存在对应的操作
		// fiber树的切换
		root.current = finishedWork;
	}

	rootDoesHasPassiveEffect = false;
	// commit结束后，进行微任务调度
	ensureRootIsScheduled(root);
}

// 执行副作用
// 本次更新的任何create回调都必须在所有上一次更新的destroy回调执行完后再执行。因此需要分别forEach
// 整体执行流程包括：
// 1.遍历effect
// 2.首先触发所有unmount effect，且对于某个fiber，如果触发了unmount destroy，本次更新不会再触发update create
// 3.触发所有上次更新的destroy
// 4.触发所有这次更新的create
function flushPassiveEffects(pendingPassiveEffects: PendingPassiveEffects) {
	let didFlushPassiveEffect = false;
	// 1.遍历effect
	pendingPassiveEffects.unmount.forEach((effect) => {
		didFlushPassiveEffect = true;
		// 2.组件卸载的情况
		// Passive代表了接下来的遍历流程是useEffect的unmount的回调执行
		commitHookEffectListUnmount(Passive, effect);
	});
	// 遍历完将数组置空
	pendingPassiveEffects.unmount = [];
	pendingPassiveEffects.update.forEach((effect) => {
		didFlushPassiveEffect = true;
		// 3.触发所有上次更新的destroy  useEffect+HookHasEffect
		commitHookEffectListDestory(Passive | HookHasEffect, effect);
	});
	pendingPassiveEffects.update.forEach((effect) => {
		didFlushPassiveEffect = true;
		// 4.触发所有这次更新的create(ps: mount的时候也是在这里去触发的create回调)
		commitHookEffectListCreate(Passive | HookHasEffect, effect);
	});
	// 遍历完将数组置空
	pendingPassiveEffects.update = [];
	// useEffect中有setState这时候也需要触发他的更新流程
	flushSyncCallbacks();
	return didFlushPassiveEffect;
}

// beginWork
// completeWork
function workLoopSync() {
	while (workInProgress !== null) {
		performUnitOfWork(workInProgress);
	}
}

// 并发更新
function workLoopConcurrent() {
	// false 不需要被打断
	while (workInProgress !== null && !unstable_shouldYield()) {
		performUnitOfWork(workInProgress);
	}
}

function performUnitOfWork(fiber: FiberNode) {
	// next可能是子fiber或者null
	const next = beginWork(fiber, wipRootRenderLane);
	// 工作完更改状态，将pendingProps赋值给memoizedProps
	fiber.memoizedProps = fiber.pendingProps;

	if (next === null) {
		// 没有子节点，需要归
		completeUnitOfWork(fiber);
	} else {
		// 有下一个节点继续执行workLoop
		workInProgress = next;
	}
}

function completeUnitOfWork(fiber: FiberNode) {
	let node: FiberNode | null = fiber;

	do {
		completeWork(node);
		const sibling = node.sibling;

		if (sibling !== null) {
			// 有兄弟节点去处理兄弟节点
			workInProgress = sibling;
			return;
		}
		// 没有兄弟节点则返回父节点
		node = node.return;
		workInProgress = node;
	} while (node !== null);
}
