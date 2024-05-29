import { resolvePkgPath, getPackageJSON, getBaseRollupPlugins } from './utils';
import generatePackageJson from "rollup-plugin-generate-package-json";


// 获取react包下的package.json内容中name: react、module: index.ts(入口)
const { name, module } = getPackageJSON('react');
// 得到react包的绝对路径
const pkgPath = resolvePkgPath(name);
// 得到react包的产物路径
const pkgDistPath = resolvePkgPath(name, true);

// "build:dev": "rimraf dist && rollup --bundleConfigAsCjs --config scripts/rollup/dev.config.js"
// rollup默认cjs，但是我们这里用的esmodule，因此加上bundleConfigAsCjs
export default [
  // react
  {
    input: `${pkgPath}/${module}`,
    output: {
			file: `${pkgDistPath}/index.js`,
			name: 'React',
			format: 'umd'
		},
    plugins: [
      ...getBaseRollupPlugins(),
      // dist/package.json
      generatePackageJson({
        inputFolder: pkgPath, // 输入目录
        outputFolder: pkgDistPath, // 输出目录
        baseContents: ({name, description, version}) => ({
          name,
          description,
          version,
          main: 'index.js', // 输出产物umd支持cmjs，所以用main
        })
      }),
    ]
  },
  // jsx-runtime
  {
    input: `${pkgPath}/src/jsx.ts`,
    output: [
      // jsx-runtime
      {
        file: `${pkgDistPath}/jsx-runtime.js`,
        name: 'jsx-runtime',
        format: 'umd' // 兼容commonjs esmodule
      },
      // jsx-dev-runtime
      {
        file: `${pkgDistPath}/jsx-dev-runtime.js`,
        name: 'jsx-dev-runtime',
        format: 'umd' // 兼容commonjs esmodule
      }
    ],
    plugins: getBaseRollupPlugins()
  }
]