// react包的打包配置
import generatePackageJSON from 'rollup-plugin-generate-package-json';
import { getPackageJSON, resolvePkgPath, getBaseRollupPlugins } from './utils';
import alias from '@rollup/plugin-alias';

const { name, module } = getPackageJSON('react-dom');
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
