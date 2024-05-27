export type Container = Element;
export type Instance = Element;

// 创建要被插入DOM
// export const createInstance = (type: string, props: any): Instance => {
export const createInstance = (type: string): Instance => {
	// todo 处理props

	// document.createElement('div')
	const element = document.createElement(type);
	return element;
};

// 插入孩子节点
export const appendInitialChild = (
	parent: Instance | Container,
	child: Instance
) => {
	// appendChild 方法用于将一个节点（child）添加到另一个节点（parent）的子节点列表中。在DOM（文档对象模型）操作中，
	// 当你调用 parent.appendChild(child)，child 节点会被插入到 parent 节点的子节点列表的末尾。
	// 这意味着如果 parent 节点已经包含子节点，那么 child 节点将作为最后一个子节点被添加。如果 parent 节点没有子节点，child 将成为它的第一个子节点。
	parent.appendChild(child);
};

// 创建文本dom
export const createTextInstance = (content: string) => {
	return document.createTextNode(content);
};

// 将元素插到父节点
export const appendChildToContainer = appendInitialChild;
