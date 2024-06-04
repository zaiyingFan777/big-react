## 1.useEffect 执行顺序

包含父亲->儿子->孙子
mount: 孙子、儿子、父亲
unmount: 父亲、儿子、孙子

```
useEffect(() => {
  console.log('mount')
  return () => {
    console.log('unmount')
  }
}, [])
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

```
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

```
function App() {
  _s();
  const [num, setNum] = useState(100);
  window.setNum = setNum;
  return num === 3 ? /* @__PURE__ */ jsxDEV(Child, {}, void 0, false, {
    fileName: "D:/workspace/big-react/demos/test-useState/main.tsx",
    lineNumber: 18,
    columnNumber: 22
  }, this) : /* @__PURE__ */ jsxDEV("div", { children: num }, void 0, false, {
    fileName: "D:/workspace/big-react/demos/test-useState/main.tsx",
    lineNumber: 18,
    columnNumber: 34
  }, this);
}
```

2. 接下来进入 wip Child 的 beginwork 流程，因为 wip Child 的 alternate 为 null，所以我们不需要跟踪副作用（current 为 null，有点类似于首屏渲染的性能优化，completework 构建好离屏 Child 以及她下面子节点的 dom，直接插入 Child），执行 Child 函数，执行 jsxDEV 这样就得到了 span 的 reactElement，然后新建 span 的 wip fibernode。这样 Child wip 的 beginwork 完毕，得到 span 的 fibernode，接着进入 span 的 fibernode 类似于第一次 mount，生成文本的 wip fibernode，当然 span、文本的 wip fiber 的 flag 都为 0，只有 Child 的 flag 为 1，因为类似于首屏渲染

```
function Child() {
  return /* @__PURE__ */ jsxDEV("span", { children: "big-react" }, void 0, false, {
    fileName: "D:/workspace/big-react/demos/test-useState/main.tsx",
    lineNumber: 23,
    columnNumber: 10
  }, this);
}
```

3. 进入 completework 的阶段会生成 text 文本节点、span 节点，并将 text 插入到 span 中，构建好离屏 span dom，wip app 的 flag 为 4 删除，deletions: [div fiber]，wip app.child 为 wip Child，并且 wip Child 的 flag 为 1，需要将 child 下面的节点插入到 root 中，因为 app 里面没有 dom 就只有 Child，上面 completework 的流程会有冒泡的过程，因此 wip Child 的 flag 会冒泡给 wip app 的 subtreeflag 上，这样 cur app 的 flag 为 4（删除），subtreeflag 为 1（新增）。wip CHild 的 flag(4)与 subtreeflag(1)会冒泡给 wip hostrootfiber。wip hostrootfiber.subtreeFlags = 5;
4. 进入到 commit 阶段，finishedWork（wip hostrootfiber）的 subtreeflag & MutationMask !== NoFlags，会进入到 mutation 阶段，commitMutationEffects 会找到需要被插入的 wip Child fibernode，并将 wip Child.child.stateNode 插入到#root 中，完事后，移除 wip Child.flag(1)变为 0。接着向上归找到 wip app，执行 wip app 的 delete 操作，遍历 deletions 的 cur fibernode，执行 commitDeletion，执行 commitDeletion 会递归删除子节点（dfs）[找到要被删除的 cur fibernode 下的第一个 host 类型的 fiber，并移除]完事后移除 wip fibernode 的 flag(4)变为 0。mutation 阶段完事后，将 wip 切换为 current

## 4.关于 hook 执行顺序

我们会在 react 包中声明内部数据共享集（为 Null），在 shared 包里也会引用 react 的内部数据共享集，在 react-reconciler 中在 renderwithhooks 中定义不同时期的内部数据共享集（mount、update 等），然后在不同时期对数据共享集赋值。其中需要注意，react-reconciler 引用了 react 的内部数据共享集这就说明 react 被打包到 react-dom 中，这时候 react 的数据共享集和 react-dom 的数据共享集不是同一个对象，为了是同一个对象我们在打包 react-dom 的时候不把 react 打包进去(通过配置)。(如果打包在一起，意味着打包后的 ReactDOM 中会包含 React 的代码，那么 ReactDOM 中会包含一个「内部数据共享层」，React 中也会包含一个「内部数据共享层」，这两者不是同一个「内部数据共享层」。) 函数组件执行流程，如果是 mount 时期，执行 renderwithhooks 函数，根据 mount 还是 update 对内部数据共享集赋值，然后再去执行 Component(函数组件的函数)，这时候函数组件的 useState 就是我们刚才赋值的内部数据共享集

## 4.关于合成事件的执行顺序

我们在 ReactDOM.createRoot().render()中 render 函数中执行 Init 函数，对 container 做事件代理，这样我们点击 container 里面的 dom 元素时，e.target 就是点击的 dom 元素然后 dispatchEvent 就 1.从 e.target 被点击的元素向上收集沿途的事件一直到 container，2.构造合成事件 3.遍历 capture 捕获 4.遍历冒泡 click
