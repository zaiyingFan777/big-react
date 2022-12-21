# big-react

## 项目搭建

1. 我们项目采用 Mono-repo 的形式：Mono-repo 可以很方便的协同管理不同独立的库的生命周期，相对应的，会有更高的操作复杂度。

2. 我们选择 pnpm 作为我们的打包工具

pnpm 初始化

```
npm install -g pnpm
pnpm init
```

初始化 pnpm-workspace.yaml(https://pnpm.io/zh/pnpm-workspace_yaml)

3. 定义开发规范

代码规范：lint 工具 eslint

```
pnpm i eslint -D -w  -D为开发依赖、-w安装在根目录

初始化：
npx eslint --init

选择了如下
√ How would you like to use ESLint? · problems
√ What type of modules does your project use? · esm
√ Which framework does your project use? · none
√ Does your project use TypeScript? · No / Yes
√ Where does your code run? · browser
√ What format do you want your config file to be in? · JSON
√ Would you like to install them now? · No / Yes
√ Which package manager do you want to use? · pnpm
```

上述安装后需要重新安装：pnpm i -D -w @typescript-eslint/eslint-plugin, @typescript-eslint/parser

最后会报 peer dependencies 的问题
ps: 既依赖又不需要安装的库作为你的 peer dependencies，因此 pnpm i -D -w typescript

安装 ts 的 eslint 的插件

```
pnpm i -D -w @typescript-eslint/eslint-plugin
```

4. 处理代码风格 prettier

```
pnpm i prettier -D -w
```

新建.prettierrc.json 配置文件，添加配置:

```
{
  "printWidth": 80,
  "tabWidth": 2,
  "useTabs": true,
  "singleQuote": true,
  "semi": true,
  "trailingComma": "none",
  "bracketSpacing": true
}
```

eslint 也会检查代码风格，为了不冲突，需要将 prettier 集成到 eslint 中，其中：

- eslint-config-prettier：覆盖 ESLint 本身的规则配置

- eslint-plugin-prettier：用 Prettier 来接管修复代码即 eslint --fix

```
pnpm i eslint-config-prettier eslint-plugin-prettier -D -w
```

为 lint 增加对应的执行脚本，并验证效果：

```
"lint": "eslint --ext .ts,.jsx,.tsx --fix --quiet ./packages"
```

5. commit 规范检查

安装 husky，用于拦截 commit 命令：

```
pnpm i husky -D -w
```

初始化 husky：

```
npx husky install
```

将刚才实现的格式化命令 pnpm lint 纳入 commit 时 husky 将执行的脚本：

```
npx husky add .husky/pre-commit "pnpm lint"
```

通过 commitlint 对 git 提交信息进行检查，首先安装必要的库：

```
pnpm i commitlint @commitlint/cli @commitlint/config-conventional -D -w
```

新建配置文件.commitlintrc.js：

```
module.exports = {
  extends: ["@commitlint/config-conventional"]
};
```

集成到 husky 中：

```
npx husky add .husky/commit-msg "npx --no-install commitlint -e $HUSKY_GIT_PARAMS"
```

conventional 规范集意义：

```
// 提交的类型: 摘要信息
<type>: <subject>
```

常用的 type 值包括如下:

- feat: 添加新功能
- fix: 修复 Bug
- chore: 一些不影响功能的更改
- docs: 专指文档的修改
- perf: 性能方面的优化
- refactor: 代码重构
- test: 添加一些测试代码等等

配置 tsconfig.json：

```
{
	"compileOnSave": true,
	"compilerOptions": {
		"target": "ESNext",
		"useDefineForClassFields": true,
		"module": "ESNext",
		"lib": ["ESNext", "DOM"],
		"moduleResolution": "Node",
		"strict": true,
		"sourceMap": true,
		"resolveJsonModule": true,
		"isolatedModules": true,
		"esModuleInterop": true,
		"noEmit": true,
		"noUnusedLocals": true,
		"noUnusedParameters": true,
		"noImplicitReturns": false,
		"skipLibCheck": true,
		"baseUrl": "./packages"
	}
}
```

6. 选择项目的打包工具

比较不同打包工具的区别 参考资料：Overview | Tooling.Report(https://bundlers.tooling.report/)我们要开发的项目的特点：

- 是库，而不是业务项目
- 希望工具尽可能简洁、打包产物可读性高
- 原生支持 ESM

所以选择 rollup，安装：

```
pnpm i -D -w rollup
```
