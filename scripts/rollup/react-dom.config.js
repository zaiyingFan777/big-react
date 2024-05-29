import { resolvePkgPath, getPackageJSON, getBaseRollupPlugins } from './utils';
import generatePackageJson from "rollup-plugin-generate-package-json";
import alias from '@rollup/plugin-alias';

// 将react-reconciler打包到react-dom里，因为react-reconciler与宿主环境无关

// 获取react-dom包下的package.json内容中name: react、module: index.ts(入口)
const { name, module, peerDependencies } = getPackageJSON('react-dom');
// 得到react-dom包的绝对路径
const pkgPath = resolvePkgPath(name);
// 得到react-dom包的产物路径
const pkgDistPath = resolvePkgPath(name, true);

// "build:dev": "rimraf dist && rollup --bundleConfigAsCjs --config scripts/rollup/dev.config.js"
// rollup默认cjs，但是我们这里用的esmodule，因此加上bundleConfigAsCjs
export default [
  // react-dom
  {
    input: `${pkgPath}/${module}`,
    output: [
      {
        file: `${pkgDistPath}/index.js`,
        name: 'index.js',
        format: 'umd'
      },
      {
        file: `${pkgDistPath}/client.js`,
        name: 'client.js',  // react18以后 'ReactDOM/client'
        format: 'umd'
      }
    ],
    // 数据共享层，如果react-dom里面打包了数据共享层，react中也有，那么他们就不能共享了
    // 因此不能将react的代码打包到react-dom里。这样react-dom、react两者可以共用一个数据共享层
    external: [...Object.keys(peerDependencies)], // react
    plugins: [
      ...getBaseRollupPlugins(),
      // webpack resolve alias
      alias({
        entries: {
          hostConfig: `${pkgPath}/src/hostConfig.ts`
        }
      }),
      // dist/package.json
      generatePackageJson({
        inputFolder: pkgPath, // 输入目录
        outputFolder: pkgDistPath, // 输出目录
        baseContents: ({name, description, version}) => ({
          name,
          description,
          version,
          peerDependencies: {
            react: version
          },
          main: 'index.js', // 输出产物umd支持cmjs，所以用main
        })
      }),
    ]
  }
]