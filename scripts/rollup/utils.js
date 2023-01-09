/* eslint-disable prettier/prettier */
import path from 'path';
import fs from 'fs';

// plugins
import ts from 'rollup-plugin-typescript2';
import cjs from '@rollup/plugin-commonjs';
import replace from '@rollup/plugin-replace';

// 先找到pkgPath，就是根目录下的packages
const pkgPath = path.resolve(__dirname, '../../packages');
// 打包产物的路径
const distPath = path.resolve(__dirname, '../../dist/node_modules');

// 获取包的路径 1. 源码路径、2.打包后的路径
export function resolvePkgPath(pkgName, isDist) {
	if (isDist) {
		return `${distPath}/${pkgName}`;
	}
	return `${pkgPath}/${pkgName}`;
}

// 根据name获取对应包package.json
export function getPackageJSON(pkgName) {
	// ...包路径  比如根目录/packages/react/package.json pkgName就是react
	const path = `${resolvePkgPath(pkgName)}/package.json`;
	const str = fs.readFileSync(path, {
		encoding: 'utf-8'
	}); // 将json读成字符串
	return JSON.parse(str);
}

// 获取所有的基础的插件
export function getBaseRollupPlugins({
	alias = {
		__DEV__: true,
		preventAssignment: true
	},
	typescript = {}
} = {}) {
	// 解析commonjs规范
	// 将源码中的ts转为js的ts的插件
	return [replace(alias), cjs(), ts(typescript)];
}