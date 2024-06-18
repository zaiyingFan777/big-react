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
2. 第一次 update，根据 mount 后的 hostRootFiber，创建 wip，因为 fiberRootNode.current.alternate 存在，我们直接复用，然后将 current.child 赋值给 wip.child(他俩本身就通过 alternate 相互连接了)，但是 current 或者 wip 的 child、child.child 他们的 alternate 都是 null，因此我们在 beginWork(hostRootFiber[wip])的时候，创建 App 的 fiberNode 的时候需要 useFiber 根据 current（App）重新创建 wip fiberNode(因为 current.alternate 为 null，重新创建，虽然 wip hostRootFiber.child 是存在的,但是 cur app 与 wip app 是没有 alternate 连接的，因此根据 current 新建了一个 wip app 并于 curr 关联，并将新建的与 wip hostRootFiber 相关联)，这时候 app wip fibernode 就是新创建好的，然后跟 current app 保持好连接，出来后又跟 hostRootFiber wip 做好了连接，同理，第一次 update 的 fiberNode 都是根据 current fiber 构建的，并做好链接
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
