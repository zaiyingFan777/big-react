// react包的打包配置
import generatePackageJSON from 'rollup-plugin-generate-package-json';
import { getPackageJSON, resolvePkgPath, getBaseRollupPlugins } from './utils';
import alias from '@rollup/plugin-alias';

const { name, module, peerDependencies } = getPackageJSON('react-dom');
// react-dom包的路径
const pkgPath = resolvePkgPath(name);
// react-dom产物路径
const pkgDistPath = resolvePkgPath(name, true);

export default [
	// react-dom
	{
		input: `${pkgPath}/${module}`, // big-react\packages\react\index.ts
		output: [
			// react17以及17之前，react-dom来自"ReactDOM"
			{
				file: `${pkgDistPath}/index.js`,
				name: 'index.js',
				format: 'umd' // umd格式可以兼容esmodule和commonjs两种格式
			},
			// react18之后 react-dom来自"ReactDOM/client"
			{
				file: `${pkgDistPath}/client.js`,
				name: 'client.js',
				format: 'umd' // umd格式可以兼容esmodule和commonjs两种格式
			}
		],
		// 不会将react打包到react-dom中 // 代表了react-dom这个包打包的时候什么对于他来说是外部的包，如果是外部的包，就不会打包到react-dom中
		// 这样的化两者互相打包不会到对方里，而且能共用我们的hooks数据共享层次
		// 这样在react-reconciler中实现不同情况的hooks的具体实现
		external: [...Object.keys(peerDependencies)],
		plugins: [
			...getBaseRollupPlugins(),
			// webpack resolve alias pnpm i -D -w @rollup/plugin-alias
			// 处理hostConfig的指向
			alias({
				entries: {
					hostConfig: `${pkgDistPath}/src/hostConfig.ts` // react-dom/src/hostConfig.ts
				}
			}),
			generatePackageJSON({
				inputFolder: pkgPath,
				outputFolder: pkgDistPath,
				baseContents: ({ name, description, version }) => ({
					name,
					description,
					version,
					peerDependencies: {
						react: version
					},
					main: 'index.js'
				})
			})
		]
	}
];
