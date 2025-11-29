import { Props, Key, Ref } from 'shared/ReactTypes';
import { WorkTag } from './workTags';
import { Flags, NoFlags } from './fiberFlags';

export class FiberNode {
	type: any;
	tag: WorkTag;
	pendingProps: Props;
	key: Key;
	stateNode: any;
	ref: Ref;

	return: FiberNode | null;
	sibling: FiberNode | null;
	child: FiberNode | null;
	index: number;

	memoizedProps: Props | null;
	alternate: FiberNode | null;
	flags: Flags;

	constructor(tag: WorkTag, pendingProps: Props, key: Key) {
		// 实例属性
		this.tag = tag;
		this.key = key;
		// HostComponent <div> div对应的DOM
		this.stateNode = null;
		// tag: 0
		// FunctionComponent: () => {}
		this.type = null;

		// 构成树状结构
		// 指向父FiberNode
		this.return = null;
		// 右边的兄弟FiberNode
		this.sibling = null;
		// 第一个子FiberNode
		this.child = null;
		// <ul> li * 3 </ul>
		// 第一个li的index为0
		this.index = 0;

		this.ref = null;

		// 作为工作单元
		// 此工作单元刚开始工作的时候的props
		this.pendingProps = pendingProps;
		// 此工作单元工作结束的时候的props
		this.memoizedProps = null;

		// 如果此时fiberNode为current,则alternate指向workInProgress。
		// 如果此时fiberNode为workInProgress,则alternate指向current。
		this.alternate = null;
		// 副作用
		this.flags = NoFlags;
	}
}
