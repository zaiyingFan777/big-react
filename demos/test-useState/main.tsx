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
function App() {
	const [num, setNum] = useState(100);
	// console.log(num, 'app');
	// return <div onClick={() => setNum(num + 1)}>{num}</div>;
	// return <div onClickCapture={() => setNum(num + 1)}>{num}</div>;
	return (
		// 打印 爷爷 onClickCapture、爸爸 onClickCapture 爸爸 onClick 爷爷 onClick
		<div
			onClick={() => {
				console.log('爷爷 onClick');
			}}
			onClickCapture={(e) => {
				// e.stopPropagation(); // 在这里调用的化，就会阻止所有的捕获冒泡
				console.log('爷爷 onClickCapture');
			}}
		>
			<div
				onClick={() => {
					console.log('爸爸 onClick');
				}}
				onClickCapture={() => {
					console.log('爸爸 onClickCapture');
				}}
			>
				<div onClick={() => setNum(num + 1)}>{num}</div>
			</div>
		</div>
	);
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
