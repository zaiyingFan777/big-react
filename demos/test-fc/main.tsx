import { useState } from 'react';
import ReactDOM from 'react-dom/client';

// vite热更新，告诉vite哪里变了
console.log(import.meta.hot);

function App() {
	const [num, setNum] = useState(100);
	// window.setNum = setNum; // 测试setState

	// return num === 3 ? <Child /> : <div>{num}</div>;
	// 测试click
	// return <div onClick={() => setNum(num + 1)}>{num}</div>;
	// return <div onClickCapture={() => setNum(num + 1)}>{num}</div>;

	// 测试多节点diff
	// 备注：update(setState)的时候从根节点开始往下走：到APP函数组件后根据action和const [num, setNum] = useState(100);计算出新的num比如101，然后根据101得到arr，再根据return ul...进入到jsx
	// createReactElement下，生成新的ReactElement
	const arr =
		num % 2 === 0
			? [<li key="1">1</li>, <li key="2">2</li>, <li key="3">3</li>]
			: [<li key="3">3</li>, <li key="2">2</li>, <li key="1">1</li>];
	// return <ul onClickCapture={() => setNum(num + 1)}>{arr}</ul>;

	// 测试Fragment
	return (
		<ul onClickCapture={() => setNum(num + 1)}>
			<li>4</li>
			<li>5</li>
			{arr}
		</ul>
	);
}

function Child() {
	return <span>big-react</span>;
}

// const F = (
// 	<>
// 		<div>1</div>
// 		<div>2</div>
// 	</>
// );

// console.log(F);

console.log(<App />);

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	<App />
);
