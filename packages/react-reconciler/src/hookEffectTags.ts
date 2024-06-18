// 对于fiber(fiberFlags.ts文件中)新增的PassiveEffect，代表当前fiber本次更新存在副作用。
// 对于effect hook，Passive代表 useEffect对应的effect(useLayoutEffect是其他的flag，比如Layout)
// 对于effect hook，HookHasEffect代表当前effect本次更新存在副作用，本次更新effectHook只有Passive不需要更新，有Passive和HookHasEffect需要更新(这时候函数组件就会打上PassibveEffect的标记，需要更新)
export const Passive = 0b0010; // useEffect

export const HookHasEffect = 0b0001;
