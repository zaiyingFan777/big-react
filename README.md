## 1.搭建环境零碎知识

### 1.1 pnpm i xxx -D -w (-D devDependencies -w pnpm-workspace根目录)

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