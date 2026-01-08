export type Flags = number;

export const NoFlags = 0b00000000000000000000000000;
export const Placement = 0b00000000000000000000000010;
export const Update = 0b00000000000000000000000100;
export const ChildDeletion = 0b00000000000000000000010000;

// 代表当前fiber本次更新存在副作用
export const PassiveEffect = 0b00000000000000000000100000;
export const Ref = 0b00000000000000000001000000;

export const MutationMask = Placement | Update | ChildDeletion | Ref;
export const LayoutMask = Ref;

// 函数组件app被卸载，那么destory函数会被触发
export const PassiveMask = PassiveEffect | ChildDeletion;
