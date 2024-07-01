import { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';

function App() {
	const [isDel, del] = useState(false);
	const divRef = useRef(null);

	console.warn('render divRef', divRef.current);

	useEffect(() => {
		console.warn('useEffect divRef', divRef.current);
	}, []);

	return (
		<div ref={divRef} onClick={() => del(true)}>
			{isDel ? null : <Child />}
		</div>
	);
}

function Child() {
	return <p ref={(dom, xxx) => console.warn('dom is:', dom, xxx)}>Child</p>;
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	<App />
);

// 打印顺序
// mount：mount时，ref.current为null，然后下面的顺序为深度优先(commitEffects)，先递归寻找子节点，再往上归 先执行子节点再执行父节点, 孙子、子、父
// render divRef null
// dom is null    // mutation解绑之前的ref
// dom is <p>Child</p> // layout绑定新的ref
// useEffect divRef <div>...</div> // useEffect为异步的可以拿到dom元素

// 点击div
// 因为触发了更新，需要重新render app组件，先执行app函数，打印render divRef，因为Mount阶段已经挂在了ref，因此打印 render divRef 、<div>...</div>
// 触发了卸载，执行unmount阶段，打印dom is null
