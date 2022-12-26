// 存放FiberNode的文件
import { Props, Key, Ref } from 'shared/ReactTypes';
import { WorkTag } from './workTags';
import { Flags, NoFlags } from './fiberFlags';

// reconciler的工作方式
// 对于同一个节点，比较其ReactElement与fiberNode，生成子fiberNode。并根据比较的结果生成不同标记（插入、删除、移动......），对应不同宿主环境API的执行。

export class FiberNode {
	tag: WorkTag;
	pendingProps: Props;
	key: Key;
	stateNode: any;
	type: any;
	ref: Ref;

	return: FiberNode | null;
	sibling: FiberNode | null;
	child: FiberNode | null;
	index: number;

	memoizedProps: Props | null;
	alternate: FiberNode | null;
	flags: Flags;

	// key ReactElement key
	// pendingProps fibernode接下来有哪些prop需要改变
	constructor(tag: WorkTag, pendingProps: Props, key: Key) {
		// FiberNode实例属性
		this.tag = tag;
		this.key = key;
		// 对于HostComponent <div></div> 而言。stateNode就是报错的div的Dom
		this.stateNode = null;
		// 类型，FunctionComponent tag为0，这个type就是() => {}函数本身
		this.type = null;

		// 构成树状结构
		// 节点之间的关系
		// 指向父FiberNode
		this.return = null;
		// 指向右边FiberNode
		this.sibling = null;
		// 指向第一个子FiberNode
		this.child = null;
		// <ul>li * 3</ul> 第一个li的index为0，第二个为1，第三个为2
		this.index = 0;

		this.ref = null;

		// 作为工作单元
		this.pendingProps = pendingProps; // 工作单元刚开始工作的时候的props是什么
		this.memoizedProps = null; // 工作单元结工作完确定的props是什么
		// 如果当前的为current，alternate代表的是workInProgress，如果为workInProgress，alternate为current
		this.alternate = null;
		// 统称为副作用，标记：删除、插入
		this.flags = NoFlags;
	}
}
