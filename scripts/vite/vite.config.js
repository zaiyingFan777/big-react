import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import replace from '@rollup/plugin-replace';
import { resolvePkgPath } from '../rollup/utils';
import path from 'path';

// dev环境vite插件体系与rollup兼容
// build环境下则完全由rollup打包

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [
		react(),
		replace({
			__DEV__: true,
			preventAssignment: true
		})
	],
	resolve: {
		// 比如demos下的main.tsx引入的react，reactDOM需要更改为项目中packages的代码
		alias: [
			{
				find: 'react',
				replacement: resolvePkgPath('react')
			},
			{
				find: 'react-dom',
				replacement: resolvePkgPath('react-dom')
			},
			{
				find: 'react-noop-renderer',
				replacement: resolvePkgPath('react-noop-renderer')
			},
			{
				find: 'hostConfig', // hostConfig需要指向我们react-dom下的hostConfig
				replacement: path.resolve(
					resolvePkgPath('react-dom'), //  resolvePkgPath('react-noop-renderer')
					'./src/hostConfig.ts'
				)
			}
		]
	}
});
// console.log(resolvePkgPath('react'), '1111111'); // D:\workspace\big-react\packages/react
