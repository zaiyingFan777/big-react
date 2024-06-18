export type Flags = number;

export const NoFlags = 0b0000000;
export const Placement = 0b0000001; // 插入
export const Update = 0b0000010; // 更新
export const ChildDeletion = 0b0000100; // 删除

export const PassiveEffect = 0b0001000; // 当前fiber存在触发useEffect的情况

export const MutationMask = Placement | Update | ChildDeletion;

// function App() {
//   useEffect(() => {
//     // create
//     return () => {
//       // destroy
//     }
//   }, [xxx, yyy])
// }

export const PassiveMask = PassiveEffect | ChildDeletion; // 函数组件卸载useEffect return的回调函数需要被调用
