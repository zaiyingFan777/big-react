// 为jest增加JSX解析能力，安装Babel：pnpm i -D -w @babel/core @babel/preset-env @babel/plugin-transform-react-jsx
// jest会直接读取项目下的babel.config.js
module.exports = {
	presets: ['@babel/preset-env'],
	plugins: [['@babel/plugin-transform-react-jsx', { throwIfNamespace: false }]]
};
