export type Flags = number;

export const NoFlags = 0b0000001; // 1 无标记
export const Placement = 0b0000010; // 2 插入
export const Update = 0b0000100; // 4 更新属性
export const ChildDeletion = 0b0001000; // 8 删除子节点
