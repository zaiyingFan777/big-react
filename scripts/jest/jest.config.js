// const { defaults } = require('jest-config');

// module.exports = {
// 	...defaults,
// 	// 这个命令就是根目录下package.json的pnpm test命令
// 	rootDir: process.cwd(), // jest启动的根目录，process.cwd()是命令执行的根目录，"test": "jest --config scripts/jest/jest.config.js"
// 	modulePathIgnorePatterns: ['<rootDir>/.history'], // <rootDir>这样指定的话为根目录，忽略.history
// 	// 包从哪里解析
// 	moduleDirectories: [
// 		// 对于 React ReactDOM
// 		'dist/node_modules',
// 		// 对于第三方依赖
// 		...defaults.moduleDirectories
// 	],
// 	testEnvironment: 'jsdom'
// };

const { defaults } = require('jest-config');

module.exports = {
	...defaults,
	rootDir: process.cwd(),
	modulePathIgnorePatterns: ['<rootDir>/.history'],
	moduleDirectories: [...defaults.moduleDirectories, 'dist/node_modules'],
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
