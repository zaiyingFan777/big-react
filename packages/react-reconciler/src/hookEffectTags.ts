// useEffect的tag，useLayoutEffect的tag我们没有实现
export const Passive = 0b0010;
// mount、依赖变化时，effect的create回调需要被触发，因此添加此标记
export const HookHasEffect = 0b0001;
