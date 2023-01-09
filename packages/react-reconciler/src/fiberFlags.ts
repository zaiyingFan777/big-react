export type Flags = number;

export const NoFlags = 0b00000000000000000000000000; // 0 无标记
export const Placement = 0b00000000000000000000000010; // 2 插入
export const Update = 0b00000000000000000000000100; // 4 更新属性
export const ChildDeletion = 0b00000000000000000000010000; // 16 删除子节点

// useEffect
// export const PassiveEffect = 0b00000000000000000000100000;

export const MutationMask = Placement | Update | ChildDeletion; // 22
