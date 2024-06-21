const { defaults } = require('jest-config');

module.exports = {
  ...defaults,
  rootDir: process.cwd(), // pnpm test => package.json里的test命令，找到了scripts/jest/jest.config.js，然后指定 rootDir 命令执行的根文件夹 即package.json(test命令)所在的文件夹
  modulePathIgnorePatterns: ['<rootDir>/.history'], // 忽略
  moduleDirectories: [
    // 对于 React ReactDOM
    'dist/node_modules',
    // 对于第三方依赖，使用默认配置比如根目录的node_modules
    ...defaults.moduleDirectories
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

// pnpm test ReactEffectOrdering-test