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
	const arr =
		num % 2 === 0
			? [<li key="1">1</li>, <li key="2">2</li>, <li key="3">3</li>]
			: [<li key="3">3</li>, <li key="2">2</li>, <li key="1">1</li>];
	return <ul onClickCapture={() => setNum(num + 1)}>{arr}</ul>;
}

function Child() {
	return <span>big-react</span>;
}

console.log(<App />);

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	<App />
);
