// React
import { jsxDEV } from './src/jsx'; // 报错 [!] RollupError: Could not resolve "./src/jsx" from "packages/react/index.ts"

export default {
	version: '0.0.0',
	createElement: jsxDEV
};
