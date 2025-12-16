const { defaults } = require('jest-config');

module.exports = {
	...defaults,
	rootDir: process.cwd(), // jest启动的根目录，pnpm test执行所在的目录
	modulePathIgnorePatterns: ['<rootDir>/.history'],
	moduleDirectories: [
		// 对于 React ReactDOM，从dist/node_modules目录下去解析
		'dist/node_modules',
		// 对于第三方依赖
		...defaults.moduleDirectories
	],
	testEnvironment: 'jsdom'
};
