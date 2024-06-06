import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';

console.log(import.meta.hot);

// function App() {
// 	const [num, setNum] = useState(100);
// 	window.setNum = setNum;
// 	// console.log(num, 'app');
// 	return <div>{num}</div>;
// }

// function App() {
// 	const [num, setNum] = useState(100);
// 	window.setNum = setNum;
// 	// console.log(num, 'app');
// 	return num === 3 ? <Child /> : <div>{num}</div>;
// }

// function Child() {
// 	return <span>big-react</span>;
// }

// 测试合成事件
// function App() {
// 	const [num, setNum] = useState(100);
// 	// console.log(num, 'app');
// 	// return <div onClick={() => setNum(num + 1)}>{num}</div>;
// 	// return <div onClickCapture={() => setNum(num + 1)}>{num}</div>;
// 	return (
// 		// 打印 爷爷 onClickCapture、爸爸 onClickCapture 爸爸 onClick 爷爷 onClick
// 		<div
// 			onClick={() => {
// 				console.log('爷爷 onClick');
// 			}}
// 			onClickCapture={(e) => {
// 				// e.stopPropagation(); // 在这里调用的化，就会阻止所有的捕获冒泡
// 				console.log('爷爷 onClickCapture');
// 			}}
// 		>
// 			<div
// 				onClick={() => {
// 					console.log('爸爸 onClick');
// 				}}
// 				onClickCapture={() => {
// 					console.log('爸爸 onClickCapture');
// 				}}
// 			>
// 				<div onClick={() => setNum(num + 1)}>{num}</div>
// 			</div>
// 		</div>
// 	);
// }

// 测试多节点diff
// function App() {
// 	const [num, setNum] = useState(100);

// 	const arr =
// 		num % 2 === 0
// 			? [<li key="1">1</li>, <li key="2">2</li>, <li key="3">3</li>]
// 			: [<li key="3">3</li>, <li key="2">2</li>, <li key="1">1</li>];

// 	return <ul onClickCapture={() => setNum(num + 1)}>{arr}</ul>;
// }

// 测试Fragment
function App() {
	const [num, setNum] = useState(100);
	// return (
	// 	<>
	// 		<div>111</div>
	// 		<div>222</div>
	// 	</>
	// );
	// return (
	// 	<ul>
	// 		<>
	// 			<li>1</li>
	// 			<li>2</li>
	// 		</>
	// 		<li>3</li>
	// 		<li>4</li>
	// 	</ul>
	// );
	const arr =
		num % 2 === 0
			? [<li key="3">3</li>, <li key="4">4</li>, <li key="5">5</li>]
			: [<li key="5">5</li>, <li key="4">4</li>, <li key="3">3</li>];
	return (
		<ul onClickCapture={() => setNum(num + 1)}>
			<li key="1">1</li>
			<li key="2">2</li>
			{arr}
		</ul>
	);
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
