## 1.搭建环境零碎知识

### 1.1 pnpm i xxx -D -w (-D: devDependencies -w: pnpm-workspace根目录)

### 1.2 "parser": "@typescript-eslint/parser", 表示用什么工具将js代码转为抽象语法树(AST语法树)

### 1.3 安装husky，用于拦截commit命令
```zsh
# 安装husky，用于拦截commit命令：
pnpm i husky -D -w

# 初始化husky：
npx husky install

# 将刚才实现的格式化命令pnpm lint纳入commit时husky将执行的脚本：
husky add .husky/pre-commit "pnpm lint"

# 通过commitlint对git提交信息进行检查，首先安装必要的库：
pnpm i commitlint @commitlint/cli @commitlint/config-conventional -D -w

# 建配置文件.commitlintrc.js：
module.exports = {
  extends: ["@commitlint/config-conventional"]
};

# 集成到husky中：
npx husky add .husky/commit-msg "npx --no-install commitlint -e $HUSKY_GIT_PARAMS"
```

conventional规范集意义：<br/>
- feat: 添加新功能
- fix: 修复 Bug
- chore: 一些不影响功能的更改
- docs: 专指文档的修改
- perf: 性能方面的优化
- refactor: 代码重构
- test: 添加一些测试代码等等

### 1.4 tsconfig.json
```
"baseUrl": "./packages" // typescript基础的入口
```

### 1.5 pnpm 是凭什么对 npm 和 yarn 降维打击的（https://juejin.cn/post/7127295203177676837）

<strong>区别</strong>
- npm2 是通过嵌套的方式管理 node_modules 的，会有同样的依赖复制多次的问题。
- npm3+ 和 yarn 是通过铺平的扁平化的方式来管理 node_modules，解决了嵌套方式的部分问题，但是引入了幽灵依赖的问题，并且同名的包只会提升一个版本的，其余的版本依然会复制多次。
- pnpm 则是用了另一种方式，不再是复制了，而是都从全局 store 硬链接（Hard Link）到 node_modules/.pnpm，然后之间通过软链接（Symbolic Link / 软链接）来组织依赖关系。这样不但节省磁盘空间，也没有幽灵依赖问题，安装速度还快，从机制上来说完胜 npm 和 yarn。
![alt text](./assets/image.png)

<strong>pnpm 中如何用硬链接和软链接？</strong><br/>
pnpm 的核心是<strong>全局存储（Global Store） + 虚拟存储（Virtual Store）</strong>，通过链接实现 “一份包，多处复用”：
- 硬链接：全局 Store → 虚拟 Store<br/>
pnpm 会把下载的包缓存到<strong>全局 Store</strong>（比如~/.pnpm-store），每个版本的包只存一份。当你在项目中安装依赖时，pnpm 不会复制包文件，而是从全局 Store硬链接到项目的node_modules/.pnpm（虚拟 Store）。
  - 作用：全局 Store 里的包和项目虚拟 Store 里的包，本质是同一个文件的不同 “名字”，既节省磁盘空间，又能直接访问文件内容。
- 软链接：虚拟 Store → 项目 node_modules<br/>
项目根目录的node_modules里的包（比如express），其实是软链接到虚拟 Store 里的对应包（node_modules/.pnpm/express@4.18.2/node_modules/express）。<br/>
而虚拟 Store 里的包之间的依赖（比如express依赖body-parser），也是通过软链接指向虚拟 Store 里的body-parser包。
  - 作用：用软链接组织依赖关系，既保证了 “非扁平化”（避免幽灵依赖），又能让包找到自己的依赖，同时不会复制文件。

<strong>总结</strong><br/>
- 硬链接解决 “多项目复用同版本包” 的问题，节省磁盘空间。
- 软链接解决 “依赖关系组织” 的问题，既保证非扁平化（无幽灵依赖），又能让包找到自己的依赖。

### 1.6 pnpm-workspace.yaml
```yaml
packages:
  - 'packages/*'
```
packages: ['packages/*'] 表示：项目根目录下的packages文件夹中，所有直接子目录都被识别为独立的子包（package）。
例如：packages/react、packages/utils、packages/cli 等目录会被视为一个个独立的 npm 包。

## 2.实现JSX

### 2.1 React项目结构：

- react（宿主环境无关的公用方法）
- react-reconciler（协调器的实现，宿主环境无关）
- 各种宿主环境的包
- shared（公用辅助方法，宿主环境无关）

JSX转换属于react包。<strong>(注意：在packages包中创建任何包，都需要进入该包内pnpm init，然后比如react依赖了shared的包，那么在react包下执行 pnpm i)</strong><br/>
比如react包使用了shared包，那么需要将shared包添加到react包中package.json中的dependencies中
```json
{
	"name": "react",
	"version": "1.0.0",
	"description": "react公用方法",
	"module": "index.ts",
	"dependencies": {
		"shared": "workspace:*"
	},
	"keywords": [],
	"author": "",
	"license": "ISC"
}
```
流程<br/>
```zsh
# 创建react
cd packages/ && mkdir react
cd react/
# 初始化 package.json
pnpm init
```
```json
{
  "name": "react",
  "version": "1.0.0",
  "description": "react公用方法",
  // "main": "index.js", // * 本包的入口文件，main对应的是commonjs规范
  "module": "index.ts", // rollup原生支持esm，因此我们不需要上面的commonjs的main，在这里添加module的入口
  "keywords": [],
  "author": "",
  "license": "ISC"
}
```
最后在react包下创建index.ts(入口文件)

### 2.2 JSX转换是什么
<a href="https://babeljs.io/repl#?browsers=defaults&build=&builtIns=false&corejs=3.6&spec=false&loose=false&code_lz=DwEwlgbgfAjATAZmAenNIA&debug=false&forceAllTransforms=false&shippedProposals=false&circleciRepo=&evaluate=false&fileSize=false&timeTravel=false&sourceType=module&lineWrap=true&presets=react%2Cstage-2&prettier=false&targets=&version=7.19.5&externalPlugins=&assumptions=%7B%7D">JSX转换 playground<a/><br/>

<strong>babel将JSX转为了_jsx(...)或React.createElement(...)</strong>
- React17之前将JSX转为了React.createElement(...)
- React17之后将JSX转为了_jsx(...)
```ts
import { jsx as _jsx } from "react/jsx-runtime";

/*#__PURE__*/_jsx("div", {
  children: "123"
});

// 或
/*#__PURE__*/React.createElement("div", null, "123");
```

包括两部分：

- 编译时:
```js
从<div>123</div> 到 _jsx("div", {children: "123"});</code>的过程
```

- 运行时：jsx方法或React.createElement方法的实现（包括dev、prod两个环境）

<strong>编译时由babel编译实现，我们来实现运行时，工作量包括：</strong>

- 实现jsx方法
- 实现打包流程
- 实现调试打包结果的环境

<strong>rollup打包的产物格式 format: "umd", 兼容commonjs和esm</strong>
```js
{
  input: `${pkgPath}/${module}`,
  output: {
    file: `${pkgDistPath}/index.js`,
    name: 'index.js',
    format: 'umd' // umd兼容commonjs和esm
  },
}
```

### 2.3 pnpm link的本地调试方式
![alt text](./assets/pnpm-link.png)
这种方式的优点：可以模拟实际项目引用React的情况

缺点：对于我们当前开发big-react来说，略显繁琐。对于开发过程，更期望的是热更新效果。

### 2.4 Symbol 和 Symbol.for
Symbol 是 ES6 引入的基本数据类型，用于创建唯一标识；Symbol.for() 是 Symbol 的静态方法，用于创建 / 获取全局注册表中的共享 Symbol。
- 普通 Symbol
  - 通过 Symbol(key) 创建，每个都是唯一的，即使描述符（key）相同：
  ```js
  const s1 = Symbol('foo');
  const s2 = Symbol('foo');
  console.log(s1 === s2); // false（各自独立）
  ```
  - 作用：避免对象属性名冲突（如作为对象的私有属性键）。

- Symbol.for(key)
  - 在全局 Symbol 注册表中操作：
    - 若注册表中已有 key 对应的 Symbol，直接返回该 Symbol；
    - 若没有，则创建新 Symbol 并注册到全局，后续可通过相同 key 获取。
  - 特点：相同 key 对应同一个 Symbol，可跨模块 / 环境共享：
```js
const s3 = Symbol.for('bar');
const s4 = Symbol.for('bar');
console.log(s3 === s4); // true（全局共享）
```
- 核心区别
###
| 特性                | 普通 Symbol               | Symbol.for()              |
|---------------------|---------------------------|---------------------------|
| 唯一性              | 始终唯一（即使 key 相同）  | 相同 key 对应同一个 Symbol |
| 全局注册表          | 不注册                    | 注册到全局                |
| 跨模块共享          | 不支持                    | 支持                      |

## 3.实现Reconciler架构
reconciler是React核心逻辑所在的模块，中文名叫协调器。协调（reconcile）就是diff算法的意思。

### 3.1 reconciler有什么用？

jQuery工作原理（过程驱动）：

![alt text](./assets/reconciler-1.png)

前端框架结构与工作原理（状态驱动）：

- react：reconciler
- vue: renderer

![alt text](./assets/reconciler-2.png)

react:
- 消费JSX
- react没有编译优化，vue有编译优化
- 开放通用API供不同宿主环境使用

### 3.2 核心模块消费JSX的过程

核心模块操作的数据结构是？当前已知的数据结构：ReactElement<br/>
ReactElement如果作为核心模块操作的数据结构，存在的问题：
- 无法表达节点之间的关系
- 字段有限，不好拓展（比如：无法表达状态）

所以，需要一种新的数据结构，他的特点：<br/>
- 介于ReactElement与真实UI节点之间
- 能够表达节点之间的关系
- 方便拓展（不仅作为数据存储单元，也能作为工作单元）

这就是FiberNode（虚拟DOM在React中的实现），vue中虚拟DOM叫VNode。

当前我们了解的节点类型：

- JSX
- ReactElement
- FiberNode
- DOMElement

### 3.3 reconciler的工作方式
对于同一个节点，比较其ReactElement与fiberNode，生成子fiberNode。并根据比较的结果生成不同标记（插入、删除、移动......），对应不同宿主环境API的执行。

![alt text](./assets/reconciler-3.png)

比如，挂载```<div></div>```

```js
// React Element <div></div>
jsx("div")
// 对应fiberNode
null
// 生成子fiberNode（无）
// 对应标记，插入div
Placement
```

将```<div></div>```更新为```<p></p>```：
```js
// React Element <p></p>
jsx("p")
// 对应fiberNode
FiberNode {type: 'div'}
// 生成子fiberNode（无）
// 对应标记，先删除div，后插入p
Deletion Placement
```

当所有ReactElement比较完后，会生成一棵fiberNode树，一共会存在两棵fiberNode树：

- current：与视图中真实UI对应的fiberNode树
- workInProgress：触发更新后，正在reconciler中计算的fiberNode树

### 3.4 JSX消费的顺序
以DFS（深度优先遍历）的顺序遍历ReactElement，这意味着：

- 如果有子节点，遍历子节点
- 如果没有子节点，遍历兄弟节点 例子：
- Card -> h3 -> 你好（无子组件、无兄弟组件，退回到h3）-> p -> Big-React（无子组件、无兄弟组件，退回到p，p也没有兄弟节点，退回到Card）

```jsx
<Card>
  <h3>你好</h3>
  <p>Big-React</p>
</Card>
```

这是个递归的过程，存在递、归两个阶段：

- 递：对应beginWork
- 归：对应completeWork

## 4.实现状态更新机制
常见的触发更新的方式：
- ReactDOM.createRoot().render（或老版的ReactDOM.render）
- this.setState
- useState的dispatch方法

我们希望实现一套统一的更新机制，他的特点是：
- 兼容上述触发更新的方式
- 方便后续扩展（优先级机制...）

### 4.1 更新机制的组成部分
- 代表更新的数据结构 —— Update(type Action<State> = State | ((prevState: State) => State);)
- 消费update的数据结构 —— UpdateQueue
![alt text](./assets/update-1.png)

接下来的工作包括：
- 实现mount时调用的API（入口文件fiberReconciler.ts）
- 将该API接入上述更新机制中

需要考虑的事情：
- 更新可能发生于任意组件，<strong>而更新流程是从根节点递归的</strong>
- 需要一个统一的根节点保存通用信息
```js
ReactDOM.createRoot(rootElement).render(<App/>)
```
![alt text](./assets/update-2.png)
图片的一些解释
- ReactDOM.createRoot(rootElement)会创建统一的入口fiberRootNode
- rootElement这个DOM对应的fiber节点为hostRootFiber
- render(<App/>)会创建App的fiber节点

## 5.初探mount流程
更新流程的目的：

- 生成wip fiberNode树
- 标记副作用flags

更新流程的步骤：

- 递：beginWork
- 归：completeWork

### 5.1 beginWork
对于如下结构的reactElement：

```jsx
<A>
 <B/>
</A>
```
当进入A的beginWork时，通过对比B current fiberNode与B reactElement，生成B对应wip fiberNode。<br/>

在此过程中最多会标记2类与「结构变化」相关的flags：

- Placement
```
插入： a -> ab
移动： abc -> bca
```
- ChildDeletion
```
删除： ul>li*3 -> ul>li*1
```

不包含与「属性变化」相关的flag：Update
```
<img title="鸡" /> -> <img title="你太美" />
```

### 5.2 实现与Host相关节点的beginWork
首先，为开发环境增加__DEV__标识，方便Dev包打印更多信息：
```zsh
pnpm i -d -w @rollup/plugin-replace
```
<strong>HostRoot的beginWork工作流程</strong>
1. 计算状态的最新值
2. 创造子fiberNode

<strong>HostComponent的beginWork工作流程</strong>
1. 创造子fiberNode

<strong>HostText没有beginWork工作流程</strong>

因为他没有子节点

```jsx
<p>唱跳Rap</p>
```

### 5.3 beginWork性能优化策略
考虑如下结构的reactElement：
```jsx
<div>
 <p>练习时长</p>
 <span>两年半</span>
</div>
```

理论上mount流程完毕后包含的flags：

- 两年半 Placement
- span Placement
- 练习时长 Placement
- p Placement
- div Placement

相比于执行5次Placment，我们可以构建好「离屏DOM树」后，对div执行1次Placement操作

### 5.4 completeWork

需要解决的问题：

- 对于Host类型fiberNode：构建离屏DOM树
- 标记Update flag（TODO）

### 5.5 completeWork性能优化策略
flags分布在不同fiberNode中，如何快速找到他们？

答案：利用completeWork向上遍历（归）的流程，将子fiberNode的flags冒泡到父fiberNode

## 6：初探ReactDOM
react内部3个阶段：

- schedule阶段
- render阶段（beginWork completeWork）
- commit阶段（commitWork）

### 6.1 commit阶段的3个子阶段
- beforeMutation阶段
- mutation阶段
- layout阶段

当前commit阶段要执行的任务：

- fiber树的切换
- 执行Placement对应操作

需要注意的问题，考虑如下JSX，如果span含有flag，该如何找到它：
```jsx
<App>
 <div>
  <span>只因</span>
 </div>
</App>
```

### 6.2 打包ReactDOM
需要注意的点：

- 兼容原版React的导出（React17以及之前是ReactDOM/index.js，React18之后是ReactDOM/client.js）
- 处理hostConfig的指向

### 6.3 注意
react-dom包中的package.json中的解释
- dependencies，当开发者安装了react-dom，那么也会安装react-dom生产环境的依赖，shared、react-reconciler等
- peerDependencies，虽然也是依赖，并不会因为当前模块的安装而安装，因为开发者的项目中已经存在了react包
```json
{
	"name": "react-dom",
	"version": "1.0.0",
	"description": "",
	"module": "index.ts",
	"dependencies": {
		"shared": "workspace:*",
		"react-reconciler": "workspace:*"
	},
	"peerDependencies": {
		"react": "workspace:*"
	},
	"keywords": [],
	"author": "",
	"license": "ISC"
}
```

### 6.4 注意2
1. react-dom包打包react-reconciler
```ts
// 比如我们的react-reconciler使用了hostConfig的方法，这里兼容了react-dom、其他client的写法
import { appendChildToContainer, Container } from 'hostConfig';
// 需要我们在react-dom.config.js中添加配置alias
// 这么做就是在打包react-dom，react-dom中使用了react-reconciler的方法，然后react-reconciler又需要引入react-dom中
// 的hostConfig，上面的代码引入，因此我们在打包的过程中，让hostConfig: "react-dom/src/hostConfig.ts"
plugins: [
  ...getBaseRollupPlugins(),
  // webpack resolve alias
  alias({
    entries: {
      hostConfig: `${pkgPath}/src/hostConfig.ts`
    }
  }),
  ....
]
```
2. tsconfig.json中的配置仅仅是为了代码不报错
```json
{
	"compileOnSave": true,
	"compilerOptions": {
    ...
		"baseUrl": "./packages",
		"paths": {
			"hostConfig": ["./react-dom/src/hostConfig.ts"]
		}
	}
}
```

## 7. 初探FC与实现第二种调试方式
FunctionComponent需要考虑的问题：

- 如何支持FC？
- 如何组织Hooks？（下一节课讲解）

### 7.1 如何支持FC？
FC的工作同样植根于：

- beginWork
- completeWork

### 7.2 第二种调试方式
采用vite的实时调试，他的好处是「实时看到源码运行效果」。

创建vite项目：

```zsh
# 在big react目录下执行
pnpm create vite
# Project name: demos
# Select a framework: react
# Select a variant: typescript
# Use rolldown-vite (Experimental)?: No(先稳定性)
# Install with pnpm and start now? no
```

使用vite而不是webpack作为demo调试的原因：

- 在开发阶段编译速度快于webpack
- vite的插件体系与rollup兼容


### 7.3 课外资料
如果vite热更新失效，可能是因为「书写的React组件不符合规范」，可以引入eslint-plugin-react-refresh插件检查不符合规范的地方。

## 8. 实现useState
hook脱离FC上下文，仅仅是普通函数，如何让他拥有感知上下文环境的能力？

比如说：

- hook如何知道在另一个hook的上下文环境内执行？答案：1.reconciler知道当前是Mount还是update 2.根据mount/update/hooks创建不同的useState函数(在Reconciler包中实现)。3.内部数据共享层保存当前使用的hooks集合（内部数据共享层是在React包中） 4.React中调用的内部数据共享层中当前使用的Hooks的集合 5.由于React和Reconciler是解耦的，因此在shared包中进行一次中转（引入的是React中定义的_secret...）6.最后我们在Reconciler中引入shared的共享层(其实是react包中的_secret...)，并将数据注入进去
```jsx
function App() {
  useEffect(() => {
    // 执行useState时怎么知道处在useEffect上下文？
    useState(0);
  })
}
```
- hook怎么知道当前是mount还是update？

解决方案：「在不同上下文中调用的hook不是同一个函数」。
![alt text](./assets/useState-1.png)

实现「内部数据共享层」时的注意事项：

以浏览器举例，Reconciler + hostConfig = ReactDOM

增加「内部数据共享层」，意味着Reconciler与React产生关联，进而意味着ReactDOM与React产生关联。

如果两个包「产生关联」，在打包时需要考虑：「两者的代码是打包在一起还是分开？」

如果打包在一起，意味着打包后的ReactDOM中会包含React的代码，那么ReactDOM中会包含一个「内部数据共享层」(因为数据共享层是在react包中实现的)，React中也会包含一个「内部数据共享层」，这两者不是同一个「内部数据共享层」。

而我们希望两者共享数据，所以不希望ReactDOM中会包含React的代码。

答案：我们在react-dom.config.js打包中定义external: ['react']，将react作为外部包，不会打包进来

- hook如何知道自身数据保存在哪？
```jsx
function App() {
  // 执行useState为什么能返回正确的num？
  const [num] = useState(0);
}
```
答案：「可以记录当前正在render的FC对应fiberNode，在fiberNode中保存hook数据」

### 8.1 实现Hooks的数据结构
fiberNode中可用的字段：

- memoizedState
- updateQueue

![alt text](./assets/useState-2.png)

对于FC对应的fiberNode，存在两层数据：

- fiberNode.memoizedState对应Hooks链表
- 链表中每个hook对应自身的数据

### 8.3 实现useState
包括2方面工作：

- 实现mount时useState的实现
- 实现dispatch方法，并接入现有更新流程内

## 9. 实现第三种调试方式

本节课我们将实现第三种调试方式 —— 用例调试，包括三部分内容：

- 实现第一个测试工具test-utils
- 实现测试环境
- 实现ReactElement用例

与测试相关的代码都来自React仓库，可以先把React仓库下载下来：
```zsh
git clone git@github.com:facebook/react.git
```

### 9.1 实现test-utils
这是用于测试的工具集，来源自ReactTestUtils.js，特点是：使用ReactDOM作为宿主环境

### 9.2 实现测试环境
```zsh
pnpm i -D -w jest jest-config jest-environment-jsdom
```
配置：
```js
const { defaults } = require('jest-config');

module.exports = {
  ...defaults,
  rootDir: process.cwd(),
  modulePathIgnorePatterns: ['<rootDir>/.history'],
  moduleDirectories: [
    // 对于 React ReactDOM
    'dist/node_modules',
    // 对于第三方依赖
    ...defaults.moduleDirectories
  ],
  testEnvironment: 'jsdom'
};
```

### 9.3 实现ReactElement用例
来源自ReactElement-test.js，用例代码在本节最后。

为jest增加JSX解析能力，安装Babel：
```zsh
pnpm i -D -w @babel/core @babel/preset-env @babel/plugin-transform-react-jsx
```
新增babel.config.js：
```js
module.exports = {
  presets: ['@babel/preset-env'],
  plugins: [
    [
      '@babel/plugin-transform-react-jsx',
      {throwIfNamespace: false}
    ]
  ]
}
```
用例代码(见文件react/src/__tests_/ReactElement-test.js)


## 10. 初探update流程
update流程与mount流程的区别。

对于beginWork：

- 需要处理ChildDeletion的情况
- 需要处理节点移动的情况（abc -> bca）

对于completeWork：

- 需要处理HostText内容更新的情况
- 需要处理HostComponent属性变化的情况

对于commitWork：

- 对于ChildDeletion，需要遍历被删除的子树
- 对于Update，需要更新文本内容

对于useState：

- 实现相对于mountState的updateState

### 10.1 beginWork流程
本节课仅处理单一节点，所以省去了「节点移动」的情况。我们需要处理：

- singleElement
- singleTextNode

处理流程为：

1. 比较是否可以复用current fiber
- 比较key，如果key不同，不能复用
- 比较type，如果type不同，不能复用
- 如果key与type都相同，则可复用
2. 不能复用，则创建新的（同mount流程），可以复用则复用旧的

注意：对于同一个fiberNode，即使反复更新，current、wip这两个fiberNode会重复使用

### 10.2 completeWork流程
主要处理「标记Update」的情况，本节课我们处理HostText内容更新的情况。

### 10.3 commitWork流程
对于标记ChildDeletion的子树，由于子树中：

- 对于FC，需要处理useEffect unmout执行、解绑ref
- 对于HostComponent，需要解绑ref
- 对于子树的根HostComponent，需要移除DOM
所以需要实现「遍历ChildDeletion子树」的流程

### 10.4 对于useState
需要实现：

- 针对update时的dispatcher
- 实现对标mountWorkInProgresHook的updateWorkInProgresHook
- 实现updateState中「计算新state的逻辑」

其中updateWorkInProgresHook的实现需要考虑的问题：

- hook数据从哪来？
- 交互阶段触发的更新

```jsx
<div onClick={() => update(1)}></div>
```

- render阶段触发的更新（TODO）
```jsx
function App() {
  const [num, update] = useState(0);
  // 触发更新
  update(100);
  return <div>{num}</div>;
}
```
