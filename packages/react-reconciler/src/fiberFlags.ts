export type Flags = number;

export const NoFlags = 0b00000000000000000000000000;
export const Placement = 0b00000000000000000000000010; // 插入
export const Update = 0b00000000000000000000000100; // 更新
export const ChildDeletion = 0b00000000000000000000010000; // 删除

export const PassiveEffect = 0b00000000000000000000100000; // 当前fiber存在触发useEffect的情况
export const Ref = 0b00000000000000000001000000;

export const MutationMask = Placement | Update | ChildDeletion | Ref; // mutation阶段解绑之前的ref
export const LayoutMask = Ref; // layout阶段绑定新的ref

// function App() {
//   useEffect(() => {
//     // create
//     return () => {
//       // destroy
//     }
//   }, [xxx, yyy])
// }

export const PassiveMask = PassiveEffect | ChildDeletion; // 函数组件卸载useEffect return的回调函数需要被调用
