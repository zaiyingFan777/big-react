import path from 'path';
import fs from 'fs';

import ts from 'rollup-plugin-typescript2'; 
import cjs from '@rollup/plugin-commonjs';
import replace from '@rollup/plugin-replace';

const pkgPath = path.resolve(__dirname, "../../packages");
const distPath = path.resolve(__dirname, "../../dist/node_modules");

// 获取包路径
export function resolvePkgPath(pkgName, isDist) {
  if (isDist) {
    // 产物路径
    return `${distPath}/${pkgName}`
  }
  // 非产物路径
  return `${pkgPath}/${pkgName}`

}

// 解析react包下的package.json中的name属性
export function getPackageJSON(pkgName) {
  // ... 包路径
  // 拿到packages/react/package.json
  const path = `${resolvePkgPath(pkgName)}/package.json`;
  const str = fs.readFileSync(path, {encoding: 'utf-8'});
  return JSON.parse(str);
}

// 获取所有基础的rollup基础的插件
export function getBaseRollupPlugins({
  alias = {__DEV__: true},
  typescript = {}
} = {}) {
  // ts: 将我们packages下源码ts代码转为js代码
  // cjs: 解析commonjs规范的插件
  return [
    replace(alias), cjs(), ts(typescript)
  ]
}
