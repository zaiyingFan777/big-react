## 1.useEffect 执行顺序

包含父亲->儿子->孙子
mount: 孙子、儿子、父亲(原因：commitMutationEffects 会根据 subtreeflag 或者 flag 一直往下找，直到找到有对应 flag 的 fiber 进行收集，然后再往上收集，因此是先孙、子、后父亲)
unmount: 父亲、儿子、孙子(删除，操作 commitDeletion 是递归向下，因此父亲、儿子、孙子)

```jsx
useEffect(() => {
	console.log('mount');
	return () => {
		console.log('unmount');
	};
}, []);

// 实例1
function App() {
	const [num, updateNum] = useState(0);
	useEffect(() => {
		console.log('App mount');
	}, []);

	useEffect(() => {
		console.log('num change create', num);
		return () => {
			console.log('num change destroy', num);
		};
	}, [num]);

	return (
		<div onClick={() => updateNum(num + 1)}>
			{num === 0 ? <Child /> : 'noop'}
		</div>
	);
}

function Child() {
	useEffect(() => {
		console.log('Child mount');
		return () => console.log('Child unmount');
	}, []);

	return 'i am child';
}

// mount时打印：Child mount、App mount、num change create 0
// mount原因分析：mount时执行mountEffect的逻辑，因此给App、Child的fiber.flag增加了PassiveEffect的标记，并且给fiber.memoizedState的hook链表中添加了useEffect的hook，并且他们Hook的tag为Passive | HookHasEffect，在commitRoot的mutation阶段收集副作用，递归顺序是先找到flag带有PassiveEffect的最深的fiber，然后想上找，因此进入到fiberRootNode的pendingPassiveEffects的update数组中是[child.updateQueue.lastEffect，app.updateQueue.lastEffect]。因此在调度过程中flushPassiveEffects函数执行，因为unmount数组为空，update数组中这些链表并没有destroy函数，只会执行下面这个操作。因此打印顺序就是child mount、app mount、num change create 0【hook链表顺序】，执行完后，清空update数组，但是effect的destroy被create()执行后返回的函数所赋值
pendingPassiveEffects.update.forEach((effect) => {
	commitHookEffectListCreate(Passive | HookHasEffect, effect);
});

// 点击后更新时打印：Child unmount、num change destroy 0、num change create 1
// 原因分析：点击后属于更新，因此执行updateEffect，1.对于依赖项变化的变化的或者没有依赖项的我们会给fiber.flag加上PassiveEffect的标记同时hook effect的tag为Passive | HookHasEffect，对于空数组或者依赖项没变的fiber不增加标记同时hook effect我们给予的tag是Passive。2.由于num改变导致child被卸载，因此在commitRoot的mutation阶段收集副作用，对于卸载的组件我们的遍历顺序是从上往下挨个执行，因此收集unmount的副作用也是从父亲到儿子到孙子节点的顺序收集到unmount数组中。因此对于flushPassiveEffects先去清空unmount数组【组件卸载】，清空的对象是Passive的useEffect的destroy，因此打印顺序是从Child unmount如果有子孙节点那么顺序为Child、Grandson等并且给effect的tag移除HookHasEffect因为Child组件已经卸载了防止后面遍历update数组再次触发副作用。3.在updateEffect中我们会通过比较依赖关系给App第一个effect打上tag为Passive【因为他的依赖项没有变化】，第二个effect中由于num变化了，因此会给这个hook的tag打上Passive | HookHasEffect并且给app fiber打上PassiveEffect标记，这样使得在commitRoot的mutation阶段会扫描到PassiveEffect的标记，因此update数组会添加app组件的updateQueue.lastEffect。这样在flusPassiveEffect的update第一次遍历的时候执行destroy，打印出来num change destroy 0，然后在update数组第二次遍历执行create函数的时候打印num change create 1
function flushPassiveEffects(pendingPassiveEffects: PendingPassiveEffects) {
	// 1.遍历effect
	// 2.首先触发所有unmount effect，且对于某个fiber，如果触发了unmount destroy，本次更新不会再触发update create[commitHookEffectListUnmount]
	pendingPassiveEffects.unmount.forEach((effect) => {
		// 卸载
		commitHookEffectListUnmount(Passive, effect);
	});
	// 置空pendingPassiveEffects.unmount
	pendingPassiveEffects.unmount = [];
	// 3.触发所有上次更新的destroy
	pendingPassiveEffects.update.forEach((effect) => {
		// effect.tag需要是Passive 以及 HookHasEffect才会触发destroy
		// 因此对于虽然是useEffect但是没有标记HookHasEffect的，他就【不会执行触发destroy的操作】
		commitHookEffectListDestroy(Passive | HookHasEffect, effect);
	});

	// 4.触发所有这次更新的create
	pendingPassiveEffects.update.forEach((effect) => {
		commitHookEffectListCreate(Passive | HookHasEffect, effect);
	});

	pendingPassiveEffects.update = [];

	// 回调中可能有setState，需要执行更新
	flushSyncCallbacks();
}
```

## 2.mount 完的第一次更新

比如：

```
function App() {
	const [num, setNum] = useState(100);
	window.setNum = setNum;
	return <div>{num}</div>;
}
setNum(200);
```

1. 第一次 mount 完毕后 fiberRootNode.current 指向 mount 后的 hostRootFiber fiberRootNode.current.alternate 指向 mount 前的 hostRootFiber(他的 child 为 null)
2. 第一次 update，根据 mount 后的 hostRootFiber，创建 wip，因为 fiberRootNode.current.alternate 存在，我们直接复用，然后将 current.child 赋值给 wip.child(他俩本身就通过 alternate 相互连接了)，但是 current 或者 wip 的 child、child.child 他们的 alternate 都是 null，因此我们在 beginWork(hostRootFiber[wip])的时候，创建 App 的 fiberNode 的时候需要 useFiber 根据 current（App）重新创建 wip fiberNode(因为 current.alternate 为 null，重新创建，虽然 wip hostRootFiber.child 是存在的，但是 cur app 与 wip app 是没有 alternate 连接的，因此根据 current 新建了一个 wip app 并于 cur 关联，并将新建的 wip app 与 wip hostRootFiber 相关联)，这时候 app wip fibernode 就是新创建好的，然后跟 current app 保持好连接，出来后又跟 hostRootFiber wip 做好了连接，同理，第一次 update 的 fiberNode 都是根据 current fiber 构建的，并做好链接
   > - 2.1 这里我思考的是由有个误区: 就是第一次 update hostRootFiber 是 mount 时候创建的，他的子节点是 null，然后第一次 update 的时候，创建 workInProgress 的时候是根据这个服用的，然后 wip.child 指向 current.child，这时候他俩指向的同一个对象，current app fibernode，然后我们 beginwork wip hostfibernode 的时候，因为 current app fibernode 的 alternate 是 null，所以创建一个新的，然后跟 current app 相互连接，但是 wip hostfibernode 指向的也是这个 current app，因为他是 current hostfibernode,child 赋值给了 wip hostfibernode ，我当时就很蒙为啥这会还没把刚才生成的 app wip 跟现在的 wip hostfibernode 连接，为啥 wip app 的 alternate 指向新建的，因为 current hostfibernode 指向的 current app 与 wip hostfibernode 指向的 wip app 是同一个。然后接着就是把新建的 wip app 与 wip hostfibernode 相连接。
3. 第二次 update，这时候 root.current 指向上次我们构建的 wip。然后创建 wip，复用，并把 current hostrootfiber.child 赋值给 wip hostrootfiber.child。然后进行 hostrootfiber 的 beginwork，利用复用 current app.alternate 生成 wip app alternate 然后 current app .child 赋值给 wip app.child，然后并跟 wip hostrootfiber 相互连接，紧接着相下执行类似过程，确实复用了 current hostfibernode.alternate

## 3.update 第一次更新，是节点增删

比如：mount 完毕后，第一次更新为 setNum(3)

```jsx
function App() {
	const [num, setNum] = useState(100);
	window.setNum = setNum;
	// console.log(num, 'app');
	return num === 3 ? <Child /> : <div>{num}</div>;
}

function Child() {
	return <span>big-react</span>;
}
```

1. 根据 mount 后的 hostRootFiber，创建 wip，因为 fiberRootNode.current.alternate 存在，我们直接复用，接下来进入 hostRootFiber 的 beginWork 开始 diff App 组件，因为 App current 存在，但是他的 alternate 为 null（参考上面问题 2-mount 流程），因此第一次更新我们也要需要新建一个 App 的 wip fiberNode，并将 App current.child 等属性赋值给 wip App fiberNode，并且 wip app 与 current app 通过 alternate 相互连接，接下来开始 diff app wip fiberNode，这时候 cur/wip app fibernode 的 memoizedState.updateQueue.shared.pending.action 都为 3（本质是 cur app 上的更新，但是我们创建 wip app 的时候把 cur app.memoizedState 赋值给了 wip.memoizedState）,进入到 wip app beginwork，会赋值 update 时期的 useState，然后重新根据 acton: 3 重新计算 Num 为 3，见下面代码，接着就会执行 num === 3 为 true 的 jsxDEX()然后生成新的 reactElement(type: Child)，接着会 diff cur app.child(div)和 wip app.child(Child)[beginwork 的特点传入 fiber，diff 生成 child]，因为 div 和 Child 的 type 不同，需要删除 div fiber，生成 Child fiber，这时候 wip app fiber 上 deletions:[cur div fiber]，wip app 的 flags 标记删除（4），紧接着根据 child 的 reactelement 生成 child wip，并跟 wip app fiber 做好连接，因为 beginwork app 需要跟踪副作用(current !== null), beginwork wip app 生成 wip Child， 并给 wip child 添加 flag(1，新增)，这样 app 的 beginwork 工作就完成了(这里同理于 mount 的首屏优化，给 wip Child 打标记插入，但是 Child 的子组件 span、span 的子组件 text 都没有 flag，在 completework 的过程构建离屏 dom 树，在 commit 的时候插入)。

```jsx
function App() {
	_s();
	const [num, setNum] = useState(100);
	window.setNum = setNum;
	return num === 3
		? /* @__PURE__ */ jsxDEV(
				Child,
				{},
				void 0,
				false,
				{
					fileName: 'D:/workspace/big-react/demos/test-useState/main.tsx',
					lineNumber: 18,
					columnNumber: 22
				},
				this
		  )
		: /* @__PURE__ */ jsxDEV(
				'div',
				{ children: num },
				void 0,
				false,
				{
					fileName: 'D:/workspace/big-react/demos/test-useState/main.tsx',
					lineNumber: 18,
					columnNumber: 34
				},
				this
		  );
}
```

2. 接下来进入 wip Child 的 beginwork 流程，因为 wip Child 的 alternate 为 null，所以我们不需要跟踪副作用（current 为 null，有点类似于首屏渲染的性能优化，completework 构建好离屏 Child 以及她下面子节点的 dom，直接插入 Child），执行 Child 函数，执行 jsxDEV 这样就得到了 span 的 reactElement，然后新建 span 的 wip fibernode。这样 Child wip 的 beginwork 完毕，得到 span 的 fibernode，接着进入 span 的 fibernode 类似于第一次 mount，生成文本的 wip fibernode，当然 span、文本的 wip fiber 的 flag 都为 0，只有 Child 的 flag 为 1，因为类似于首屏渲染

```js
function Child() {
	return /* @__PURE__ */ jsxDEV(
		'span',
		{ children: 'big-react' },
		void 0,
		false,
		{
			fileName: 'D:/workspace/big-react/demos/test-useState/main.tsx',
			lineNumber: 23,
			columnNumber: 10
		},
		this
	);
}
```

3. 进入 completework 的阶段会生成 text 文本节点、span 节点，并将 text 插入到 span 中，构建好离屏 span dom，wip app 的 flag 为 4 删除，deletions: [div fiber]，wip app.child 为 wip Child，并且 wip Child 的 flag 为 1，需要将 child 下面的节点插入到 root 中，因为 app 里面没有 dom 就只有 Child，上面 completework 的流程会有冒泡的过程，因此 wip Child 的 flag 会冒泡给 wip app 的 subtreeflag 上，这样 cur app 的 flag 为 4（删除），subtreeflag 为 1（新增）。wip CHild 的 flag(4)与 subtreeflag(1)会冒泡给 wip hostrootfiber。wip hostrootfiber.subtreeFlags = 5;
4. 进入到 commit 阶段，finishedWork（wip hostrootfiber）的 subtreeflag & MutationMask !== NoFlags，会进入到 mutation 阶段，commitMutationEffects 会找到需要被插入的 wip Child fibernode，并将 wip Child.child.stateNode 插入到#root 中，完事后，移除 wip Child.flag(1)变为 0。接着向上归找到 wip app，执行 wip app 的 delete 操作，遍历 deletions 的 cur fibernode，执行 commitDeletion，执行 commitDeletion 会递归删除子节点（dfs）[找到要被删除的 cur fibernode 下的第一个 host 类型的 fiber，并移除]完事后移除 wip fibernode 的 flag(4)变为 0。mutation 阶段完事后，将 wip 切换为 current

## 4.关于 hook 执行顺序

我们会在 react 包中声明内部数据共享集（为 Null），在 shared 包里也会引用 react 的内部数据共享集，在 react-reconciler 中在 renderwithhooks 中定义不同时期的内部数据共享集（mount、update 等），然后在不同时期对数据共享集赋值。其中需要注意，react-reconciler 引用了 react 的内部数据共享集这就说明 react 被打包到 react-dom 中，这时候 react 的数据共享集和 react-dom 的数据共享集不是同一个对象，为了是同一个对象我们在打包 react-dom 的时候不把 react 打包进去(通过配置)。(如果打包在一起，意味着打包后的 ReactDOM 中会包含 React 的代码，那么 ReactDOM 中会包含一个「内部数据共享层」，React 中也会包含一个「内部数据共享层」，这两者不是同一个「内部数据共享层」。) 函数组件执行流程，如果是 mount 时期，执行 renderwithhooks 函数，根据 mount 还是 update 对内部数据共享集赋值，然后再去执行 Component(函数组件的函数)，这时候函数组件的 useState 就是我们刚才赋值的内部数据共享集

## 4.关于合成事件的执行顺序

我们在 ReactDOM.createRoot().render()中 render 函数中执行 Init 函数，对 container 做事件代理，这样我们点击 container 里面的 dom 元素时，e.target 就是点击的 dom 元素然后 dispatchEvent 就 1.从 e.target 被点击的元素向上收集沿途的事件一直到 container，2.构造合成事件 3.遍历 capture 捕获 4.遍历冒泡 click

## 5.insertBefore

insertBefore 是一个 DOM 方法，用于将一个新节点插入到父节点的子节点列表中，具体位置是在指定的参考节点之前。以下是 insertBefore 方法的一般用法：

```js
语法
parentElement.insertBefore(newNode, referenceNode);
parentElement 是包含要插入节点的父元素。
newNode 是要插入的节点。
referenceNode 是父元素中已经存在的一个子节点，newNode 将被插入到这个节点之前。
参数
第一个参数 newNode 可以是元素节点（Element）、文本节点（Text）或注释节点（Comment）。
第二个参数 referenceNode 是父元素中的一个子节点，newNode 将被插入到这个节点的前面。如果 referenceNode 是 null，则 newNode 将被添加到父元素的子节点列表的末尾。
```

## 6.移动操作

关于移动操作，在 beginwork 中，我们通过 diff 会给需要插入或者移动的节点打上 Placement 的标签，然后在 commitwork 执行 Placement 标记的操作中，我们会找到被标记节点的 hostParent、sibling，如果找不到 sibling 就是 appendChild 操作，如果找到了要被插入节点的 sibling(稳定的)，我们就会执行 insertBefore 操作。

```ts
const commitPlacement = (finishedWork: FiberNode) => {
	// 我们需要知道parent dom
	// 我们需要找到finishedWork对应的dom节点，才能插入到parent节点
	if (__DEV__) {
		console.warn('执行Placement操作', finishedWork);
	}
	// parent dom
	const hostParent = getHostParent(finishedWork);

	// host sibling
	// parentNode.insertBefore需要找到【目标兄弟host节点】
	const sibling = getHostSibling(finishedWork);

	// 找到finishedWork对应的dom，并append到parent中
	if (hostParent !== null) {
		insertOrAppendPlacementNodeIntoContainer(finishedWork, hostParent, sibling);
	}
};
```

## 7.[]形式 jsx 解析

```jsx
// 非数组
function App2(){
  return <div>
    <div key="1">1</div>
    <div key="1">2</div>
  </div>
}
// 数组
function App(){
  const list = [<div key="1">1</div>, <div key="1">2</div>];

  return <div>{list}</div>
}

<App/>
=>
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
function App2() {
  return /*#__PURE__*/_jsxs("div", {
    children: [/*#__PURE__*/_jsx("div", {
      children: "1"
    }, "1"), /*#__PURE__*/_jsx("div", {
      children: "2"
    }, "1")]
  });
}
function App() {
  const list = [/*#__PURE__*/_jsx("div", {
    children: "1"
  }, "1"), /*#__PURE__*/_jsx("div", {
    children: "2"
  }, "1")];
  return /*#__PURE__*/_jsx("div", {
    children: list
  });
}
/*#__PURE__*/_jsx(App, {});
```

## 8.Fragment 元素的 jsx 编译出来是下面结果。

1. Fragment 下有多个节点

```jsx
<>
	<div>1</div>
	<div>2</div>
</>;

// 编译出来的结果
/*#__PURE__*/ _jsxs(_Fragment, {
	children: [
		/*#__PURE__*/ _jsx('div', {
			children: '1'
		}),
		/*#__PURE__*/ _jsx('div', {
			children: '2'
		})
	]
});
```

2. Fragment 下只有一个节点

```jsx
<>
	<span>111</span>
</>;

// 编译出来的结果
/*#__PURE__*/ _jsx(_Fragment, {
	children: /*#__PURE__*/ _jsx('span', {
		children: '111'
	})
});
```

3. Fragment 嵌套

```jsx
<>
	<>
		<span>111</span>
	</>
</>;

// 编译出来的结果
/*#__PURE__*/ _jsx(_Fragment, {
	children: /*#__PURE__*/ _jsx(_Fragment, {
		children: /*#__PURE__*/ _jsx('span', {
			children: '111'
		})
	})
});
```

4. 多节点 diff 中有子节点是 Fragment 的情况

```jsx
<ul>
  <>
    <li>1</li>
    <li>2</li>
  </>
  <li>3</li>
  <li>4</li>
</ul>

// 对应DOM
<ul>
  <li>1</li>
  <li>2</li>
  <li>3</li>
  <li>4</li>
</ul>

// 编译出来的结果
jsxs('ul', {
  children: [
    jsxs(Fragment, {
      children: [
        jsx('li', {
          children: '1'
        }),
        jsx('li', {
          children: '2'
        })
      ]
    }),
    jsx('li', {
      children: '3'
    }),
    jsx('li', {
      children: '4'
    })
  ]
});
```

5. 数组形式的 Fragment(diff 的时候把数组当作 fragment 来处理)

```jsx
// arr = [<li>c</li>, <li>d</li>]

<ul>
  <li>a</li>
  <li>b</li>
  {arr}
</ul>

// 对应DOM
<ul>
  <li>a</li>
  <li>b</li>
  <li>c</li>
  <li>d</li>
</ul>

// 编译后的结果
jsxs('ul', {
  children: [
    jsx('li', {
      children: 'a'
    }),
    jsx('li', {
      children: 'b'
    }),
    arr
  ]
});
```

## 9.Hook 数据类型、Update 数据类型（批处理需要特殊处理）

FunctionComponent 的 fiberNode 中 memoizedState 属性为 Hook(useState、useEffect 等)单向链表，它的数据结构如下:

1. 比如 useState 的 memoizedState 计算出来的值，next 指向下一个 hook，update 存储的是 action 和 dispatch 函数(setState)

```ts
interface Hook {
	memoizedState: any;
	updateQueue: unknown;
	next: Hook | null;
}
```

2. 我们再看一下 updateQueue 的数据结构，它存储的是 action 和 dispatch 函数(setState)

```ts
export interface UpdateQueue<State> {
	shared: {
		pending: Update<State> | null;
	};
	// 兼容Hooks
	dispatch: Dispatch<State> | null;
}
export interface Update<State> {
	action: Action<State>;
}
```

3. updateQueue 中 update 需要改变数据结构，因为可能会触发多个更新(批处理)，需要是环形链表(update 的 action 是环形链表)，以及 update 结构增加 lane，注意：UpdateQueue.shared.pending 是 update 的环形链表，它指向最后一个进来的 update，因此 UpdateQueue.shared.pending.next 指向第一个进来的 update。

```ts
export interface Update<State> {
	action: Action<State>;
	lane: Lane;
	next: Update<any> | null;
}

// 创建Update实例的方法
export const createUpdate = <State>(
	action: Action<State>,
	lane: Lane
): Update<State> => {
	return {
		action,
		lane,
		next: null
	};
};
```

## 10.批处理(Batch Update)

1. svelte、vue 批处理是在微任务中处理的
2. react 不开启并发更新也是在微任务中，开启并发更新是在宏任务中进行的。

## 11.fc 中的字段 memoizedState 字段存储的是 hooks(useState、useEffect)单向链表

```ts
interface Hook {
	// 对于useState，memoizedState是计算的state值
	// 对于useEffect，memoizedState是Effect数据结构
	memoizedState: any;
	// 对于useState，updateQueue是中shared.pending是update的环状链表，dispatch是更新函数(setState)
	updateQueue: unknown;
	// 连接下一个hook
	next: Hook | null;
}
```

useEffect、useLayoutEffect、useInsertionEffect 触发时机不一致

1. useEffect 在依赖变化后，当前 commit 阶段完成以后异步执行。
2. useLayoutEffect、useInsertionEffect 当前 commit 阶段完成后同步执行。其中 useInsertionEffect 执行的时候还拿不到 dom 的引用。

useEffect hook 数据结构，存在于 fiber.memoizedState 中 hook 链表中 effect Hook 的 memoizedState（见上文 Hook.memoizedState）属性中。然后 Effect.next 指向下一个 fc hook 的 useEffect（存在于下一个 hook 的.memoizedState 中）的 memoizedState，fiber.updateQueue.lastEffect 指向本 fc 组件的最后一个 effect 。

```ts
// effect数据结构，存在于fiber.memoizedState属性中的Hook.memoizedState中
// effect环状链表又保存在fiber.updateQueue中
export interface Effect {
	tag: Flags;
	create: EffectCallback | void; // 1.mount时 2.依赖变化时，触发create回调
	destroy: EffectCallback | void; // 函数组件销毁时，触发回调
	deps: EffectDeps;
	next: Effect | null; // 环状链表，指向下一个effect(hook.memoizedState)，不需要遍历hook链表就可以找到下一个effect相关hook数据
}

type EffectCallback = () => void;
type EffectDeps = any[] | null;

// 函数组件fiber的UpdateQueue
export interface FCUpdateQueue<State> extends UpdateQueue<State> {
	lastEffect: Effect | null; // 指向effect链表的最后一个，那么lastEffect.next就指向第一个effect
}
```

## 12. effect 工作流程

1. commit 阶段：
   - 调度副作用：在执行 mutation 阶段之前
   - 执行副作用：scheduleCallback(优先级，回调函数)，异步的调度回调函数
   - 收集副作用：收集到 fiberRootNode 的 pendingPassiveEffects 属性中，分两种情况
     - 1.commitRoot 阶段 fiberNode 标记了 PassiveEffect，commitMutationEffectsOnFiber 中做收集（收集到 pendingPassiveEffects.update 中）
     - 2.删除的情况，在 commitMutationEffectsOnFiber 中执行删除操作的时候，commitDeletion 递归删除子组件遇到 fc 组件，收集 destory 回调函数。

```
render阶段（FC fiberNode存在副作用PassiveEffect）
		⬇
commit阶段（1.调度副作用、2.收集回调）
		⬇
执行副作用
```

## 13. 关于 useEffect 中的 deps 的浅比较

比如 deps 中是一个简单类型数据，直接 Object.is 即可，如果 deps 中的数据是一个对象类型数据，mountState 的时候根据初始值去计算，然后赋值给 hook.memoizedState，如果 update 阶段这个对象没有更新，他是不会计算的因此 mount 时期的初始值对象会赋值给 Update 阶段 hook.memoizedState。因此指向的是同一个对象，Object.is 比较会返回 true。

## 14.实现并发更新

1. 扩展优先级、可以根据「触发更新的上下文环境」赋予不同优先级
2. 点击事件后（syntheticEvent 执行事件回调的时候）通过将不同类别的点击事件转为相对应的优先级，然后 unstable_runWithPriority(事件对应的优先级，() => {callback.call(null, se)})，这里 unstable_runWithPriority 会先保存当前系统优先级到 previousPriorityLevel 中，然后将事件对应的优先级保存到 currentPriorityLevel，执行 callback，执行完毕 callback，再将 currentPriorityLevel 恢复为 previousPriorityLevel。
3. 执行回调函数中的 setState(结合 1，事件回调的 callback 会调用 setState，在 dispatch 中会获取当前上下文的优先级)、首屏渲染、useEffect 中需要获取 updateLane（运行流程在 react 时，使用的是 lane 模型，运行流程在 scheduler 时，使用的是优先级。）

```ts
// 取出当前触发条件下的lane
// 我们在dispatchSetState知道是click还是useEffect触发的，因此根据触发的不同返回不同的优先级
export function requestUpdateLane(): Lane {
	// 从上下文环境中获取Scheduler优先级
	const currentSchedulerPriority = unstable_getCurrentPriorityLevel();
	// 获取当前优先级对应的lane
	const lane = schedulerPriorityToLane(currentSchedulerPriority);

	return lane;
}
function dispatchSetState<State>(
	fiber: FiberNode,
	updateQueue: UpdateQueue<State>,
	action: Action<State>
) {
	// 取出当前触发条件下的lane
	const lane = requestUpdateLane();
	// 创建更新
	const update = createUpdate<State>(action, lane);
	enqueueUpdate(updateQueue, update);
	scheduleUpdateOnFiber(fiber, lane);
}
```

4.扩展调度阶段：主要是在同步更新（微任务调度）的基础上扩展并发更新（Scheduler 调度），主要包括

- 将 Demo 中的调度策略移到项目中
- render 阶段变为【可中断】

5. 扩展 state 计算机制，扩展「根据 lane 对应 update 计算 state」的机制，主要包括：

- 通过 update 计算 state 时可以跳过「优先级不够的 update」
- 由于「高优先级任务打断低优先级任务」，同一个组件中「根据 update 计算 state」的流程可能会多次执行，所以需要保存 update

6. 跳过 update 需要考虑的问题

- 如何比较优先级是否足够？Lane 数值大小的直接比较不够灵活

```ts
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
```

- 如何同时兼顾「update 的连续性」与「update 的优先级」？新增 baseState、baseQueue 字段(baseState 为每次 render 计算的初始值（拿他作为开头来计算的），memoizedState 为每次计算的最终值)：
  - baseState 是本次更新参与计算的初始 state，memoizedState 是上次更新计算的最终 state
  - 如果本次更新没有 update 被跳过，则下次更新开始时 baseState === memoizedState
  - 如果本次更新有 update 被跳过，则本次更新计算出的 memoizedState 为「考虑优先级」情况下计算的结果，baseState 为「最后一个没被跳过的 update 计算后的结果」，下次更新开始时 baseState !== memoizedState
  - 本次更新「被跳过的 update 及其后面的所有 update」都会被保存在 baseQueue 中参与下次 state 计算
  - 本次更新「参与计算但保存在 baseQueue 中的 update」，优先级会降低到 NoLane(NoLane 与任何优先级取交集都是 NoLane，因此会继续参与后续的计算)

```js
// 只考虑连续性或优先级
// u0
{
  action: num => num + 1,
  lane: DefaultLane
}
// u1
{
  action: 3,
  lane: SyncLane
}
// u2
{
  action: num => num + 10,
  lane: DefaultLane
}

// state = 0; updateLane = DefaultLane
// 只考虑优先级情况下的结果：11，SyncLane被跳过，因此是0 -> 1 -> 11
// 只考虑连续性(不考虑优先级)情况下的结果：13，0 -> 1 -> 3 -> 13
```

```js
// 兼顾连续性与优先级
// u0
{
  action: num => num + 1,
  lane: DefaultLane
}
// u1
{
  action: 3,
  lane: SyncLane
}
// u2
{
  action: num => num + 10,
  lane: DefaultLane
}

/*
* 第一次render
* baseState = 0; memoizedState = 0;
* baseQueue = null; updateLane = DefaultLane;
* 第一次render 第一次计算
* baseState = 1; memoizedState = 1;
* baseQueue = null;
* 第一次render 第二次计算
* baseState = 1; memoizedState = 1;
* baseQueue = u1;
* 第一次render 第三次计算
* baseState = 1; memoizedState = 11;
* baseQueue = u1 -> u2(NoLane);
*/

/*
* 第二次render
* baseState = 1; memoizedState = 11;
* baseQueue = u1 -> u2(NoLane); updateLane = SyncLane
* 第二次render 第一次计算
* baseState = 3; memoizedState = 3;
* 第二次render 第二次计算
* baseState = 13; memoizedState = 13;
*/
```

7. 保存 update 的问题(因为比如上例子中，第一次 render 完，第一次 update 结果需要保存到哪，然后不影响第二次拿第一次的结果作为第二次 render 的条件来使用)

- 考虑将 update 保存在 current 中。只要不进入 commit 阶段，current 与 wip 不会互换，所以保存在 current 中，即使多次执行 render 阶段，只要不进入 commit 阶段，都能从 current 中恢复数据。

## 15.TODO!!! 目前实现的还是 renderLane、updateLane 为单个的 lane，如果扩展为 renderLanes、updateLanes，实现真正的并发更新。updateState 中的注释

1. 15.1 只有 Mount 的时候 dispatch 与 fiber 绑定，update 流程的 dispatch 并没有绑定 fiber，这点需要确定? 答案：因为新建或者复用 fibernode 时，会将 wip.memoizedState = current.memoizedState; 这时候函数组件的 hooks 链表是共用的一套，因此无论 dispatch 绑定到哪个 fiber 上，他们的 hook.updateQueue 是共用的一个对象，创建的更新进入队列，这样 cur 与 wip hook.updateQueue 的 shared.pending 保存的 update 链表都会更新。因此 cur 可能没有跟 dispatch bind，但是新的更新都会进入 cur fiber hook.updateQueue.shared.pending 中。然后计算的时候会根据 cur 状态和 updateQueue 中的 action 来进行计算赋值给 wip，然后 wip 又变成了新的 cur(状态就是根据上次 cur 和 action 计算出来的)

```
var a = {
	updateQueue: {
		shared: {
			pending: {
				action: 1
			}
		}
	}
}
var b = {
	updateQueue: a.updateQueue
}
// a b 共享一个 updateQueue
// 让b.updateQueue.shared.pending = null
// a的updateQueue.shared.pending也是Null
// 新增b的updateQueue.shared.pending = {action: 2}
// a.updateQueue.shared.pending = {action: 2}【跟上面的同理】
```

## 16.默认为同步更新(mount 时)，useTransition(启用并发特性后的那次更新启用并发更新)的作用

1. 执行过渡效果时（假设从 UI a 过渡到 UI b），通常处理逻辑包括 3 个状态：

- 初始情况是 UI a
- 开启过渡后，显示过渡中（比如 loading）效果
- 过渡完成后切换到 UI b

2. 传统「过渡中」效果的弊端：

- 时间比较短时，「过渡中效果」可能比较生硬
- 「加载过程阻塞 UI」也会带来不好的 UX

3. useTransition 就是为了解决这个问题，他的作用是：切换 UI 时，先显示旧的 UI，待新的 UI 加载完成后再显示新的 UI。
4. 因为同步任务(js 执行时间比较长)会阻碍渲染进程执行导致掉帧，开启并发更新就会在空闲时间去做更新(render)，除非有特别耗时的组件 render，基本都是在空闲时间去 render，因此不会阻碍渲染进程执行，也就是不会掉帧。

## 17.实现 useTransition

useTransition 的作用翻译成源码术语：

- 切换 UI -> 触发更新
- 先显示旧的 UI，待新的 UI 加载完成后再显示新的 UI -> 「切换新 UI」对应低优先级更新(先执行高优先级的更新，然后并发更新不会阻塞 UI，说明优先级比较低)

实现的要点：

1. 实现基础 hook 工作流程
2. 实现 Transition 优先级
3. useTransition 的实现细节

![示例图片](https://wechatapppro-1252524126.cdn.xiaoeknow.com/appjiz2zqrn2142/image/b_u_622f2474a891b_tuQ1ZmhR/lfaisbol0osc.png?imageView2/2/h/10000/q/80|imageMogr2/ignore-error/1 '示例图片标题')

```ts
const [isPending, startTransition] = useTransition();
startTransition(() => {
	update(xxx); // 这里的更新是transitionLane
});

// function mountTransition(): [boolean, (callback: () => void) => void] {}
```

图例解释：

1. 左边的 useTransition，内部包含两个 hook：
   - 第一个 hook 为 useState，对应的是 isPending 的状态。
   - 第二个 hook 保存的是 mountTransition 函数返回的第二个参数中 callback 回调，也就是用户传入的() => {update(xxx); // 这里的更新是 transitionLane}
2. useTransition 中的逻辑主要存在 右边图的 startTransition 中：
   - 右图中的 callback 是 startTransition 中传入的 callback。
   - startTransition 会触发三次更新，1.首先触发 setPending(true)[同步优先级]，isPending 就会返回 true。2.接下来会改变优先级为 TransitionLane，再还原优先级前我们会以 TransitionLane 优先级触发 callback 回调、setPending(false)，这两者（callback、setPending(false)）会在同一优先级中执行。3.还原优先级
   - 因此 callback 回调中的 setState 为 TransitionLane
   - 虽然在 startTransition 中触发了三次更新但是 setPending(true)的优先级大于 callback()、setPending(false)的优先级，所以会先执行 setPending(true)，commit 完了之后才会执行接下来的更新，所以 callback、setPending(false)才会是并发更新。

```
const [isPending, startTransition] = useTransition();
const [tab, setTab] = useState('about');
console.log('hello');
function selectTab(nextTab) {
	startTransition(() => {
		setTab(nextTab);
	});
}
// callback为开发者传进来的回调函数
function startTransition(setPending: Dispatch<boolean>, callback: () => void) {
	// 第一次改变优先级为同步优先级
	setPending(true);
	// 第二次改变优先级到transitionLane
	// 先保存当前的transition，（从共享层中拿到）
	const preTransition = currentBatchConfig.transition;
	// 修改值为1，说明我们进入了transition
	currentBatchConfig.transition = 1;

	// 都是在transitionlane下调用，这里callback的setState的dispatch会获取优先级，然后我们的requestUpdateLane会做transition的判断，如果是transition会返回transitionLane
	callback();
	setPending(false);

	// 第三次改变优先级，还原优先级
	currentBatchConfig.transition = preTransition;
}
// 上面点击事件执行后，进入startTransition，先执行setPending(true);发起一次微任务调度（同步更新，action: true进入hook的updateQueue），然后代码紧接着会!!!同步执行const preTransition = currentBatchConfig.transition;
// preTransition => null，设置currentBatchConfig.transition = 1;，进入transitionLane。
// 执行callback()，也就是() => {setTab(nextTab)};，执行setTab('contact')，这时候进入dispatch，lane为8，update为{action: "contact", lane: 8, next: null}并进入相对应的Hook的updateQueue。紧接着发起一起宏任务调度（lane为8）,此时root.pendingLanes: 9, callbackPriority: 1，进入 ensureRootIsScheduled(root);但是这时候最高优先级依然为1，return 出来，这里可以看出，setState都是异步，先把update推入到hook.updateQueue，以及给root的pendingLanes增加要更新的Lane，其他的操作也没有。
// 紧接着执行setPending(false);依然是触发dispatch，优先级为8，update为{action: false, lane: 8, next: null}，进入hook.updateQueue，这时候setPending的hook.updateQueue的为{lane: 8, action: false, next: {lane: 1, action: true, next: {...} }}的环状链表，紧接着产生调度，将优先级8合并到root.pendingLanes中（依然为9）
紧接着调度进入 ensureRootIsScheduled(root)，但是这时候最高优先级依然为1，return 出来,同上只是update进入了updateQueue。
// currentBatchConfig.transition = preTransition; 恢复优先级。
// 这时候同步代码执行完毕，开始执行setPending(true);发起的微任务调度。
// ============微任务调度=====================
// 进入app函数，这里省略useTransition的过程(计算得到Pending为true,pending为上述的环状链表两个update一个为1 true，一个为8 false, baseQueue为null，计算完毕后，hook.updateQueue为null,baseQueue为{action: false, lane: 8}[因为lane为1，action为true的先执行，没有跳过那一说，只剩下Lane为8，action为false的]，baseState，memoryState都为true,)，进入useState('about')，他的queue: {action: 'contact', lane: 8}的环状链表，由于优先级不足，无法计算，因此跳过，hook.baseQueue为 {action: 'contact', lane: 8} 这时候Hook的baseState和memoryState都是about，所以返回about，同时清空了hook的updatQueue，但是有baseQueue。
// lane为1的微任务完毕后，进入commit(root)阶段。移除root.pendingLanes上的1，从9变为了8。
// 执行完commit(root)后在commit末尾继续执行ensureRootIsScheduled(root);开启lane为8的并发更新，
// ===============并发更新=======================
// const [isPending, startTransition] = useTransition();
// 上面update流程中，进入到useTransition，hook.baseState、hook.memoizedState为true，baseQueue为{action: false, lane: 8}的环状链表, updateQueue为null，pendingQueue为null，但是baseQueue不为null，开始计算因为本次优先级为8，计算完后hook.baseState、hook.memoizedState为false，baseQueue变味了null，updateQueue也为null。
// const [tab, setTab] = useState("about");
// baseQueue为{action: "contact", lane: 8}，baseState以及memoizedState为"about"，pending为null，计算过程同上，计算出来hook.baseState、hook.memoizedState为"contact"，baseQueue为null，
// ...进入commitRoot阶段移除本次更新8 root.pendingLanes = 0,以及diff出来的结果重新渲染。最后再进入ensureRootIsScheduled 取出来的最高优先级为0。
```

## 18. useRef

1. useRef 的数据结构

- string(废弃)
- (instance: T) => void

```tsx
// 当div挂载到页面上，ref的回调函数就会执行 dom对应的就是div节点
<div ref={(dom) => console.log(dom)}></div>
```

- {current: T}

```tsx
// 默认的current为null，等div挂载到dom上了，current指向div节点
<div ref={domRef}></div>
```

2. ref 编译后的结果: 可以看出 div 的 Props 中的 ref 其实是 mount/update 时期执行 useRef 返回的 ref 对象

```tsx
function App() {
	const ref = useRef(null);
	return <div ref={ref}>ref</div>;
}
<App />;
// 编译后
import { jsx as _jsx } from 'react/jsx-runtime';
function App() {
	const ref = useRef(null);
	return /*#__PURE__*/ _jsx('div', {
		ref: ref,
		children: 'ref'
	});
}
/*#__PURE__*/ _jsx(App, {});
```

3. test-ref 的打印流程需要注意
