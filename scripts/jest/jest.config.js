const { defaults } = require('jest-config');

module.exports = {
	...defaults,
	rootDir: process.cwd(), // jest启动的根目录，pnpm test执行所在的目录
	modulePathIgnorePatterns: ['<rootDir>/.history'],
	moduleDirectories: [
		...defaults.moduleDirectories, // 对于第三方依赖
		'dist/node_modules' // 于 React ReactDOM，从dist/node_modules目录下去解析
	],
	testEnvironment: 'jsdom',
	moduleNameMapper: {
		'^scheduler$': '<rootDir>/node_modules/scheduler/unstable_mock.js'
	},
	fakeTimers: {
		enableGlobally: true,
		legacyFakeTimers: true
	},
	setupFilesAfterEnv: ['./scripts/jest/setupJest.js']
};
