export type Flags = number;

export const NoFlags = 0b00000000000000000000000000; // 0 无标记
export const Placement = 0b00000000000000000000000010; // 2 插入
export const Update = 0b00000000000000000000000100; // 4 更新属性
export const ChildDeletion = 0b00000000000000000000010000; // 16 删除子节点

// useEffect
export const PassiveEffect = 0b00000000000000000000100000; // 32 代表当前fiber上本次更新存在需要触发useEffect的情况

export const MutationMask = Placement | Update | ChildDeletion; // 22

// function App() {
//   useEffect(() => {
//       // create
//       return () => {
//           // destroy
//       }
//   }, [xxx, yyy])
//   useLayoutEffect(() => {})
//   useEffect(() => {}, [])
//   // ...
// }
// 如果app组件卸载了需要执行return的destroy函数
export const PassiveMask = PassiveEffect | ChildDeletion; // 48
