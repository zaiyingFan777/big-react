import { useState } from 'react';
import ReactDOM from 'react-dom/client';

// 打印顺序
// div onClickCapture
// p onClickCapture
// p onClick
// div onClick
function App() {
	const [num, setNum] = useState(100);
	return (
		<div
			onClickCapture={() => {
				console.log('div onClickCapture');
				setNum(num + 1);
			}}
			onClick={() => {
				console.log('div onClick');
			}}
		>
			<p
				onClickCapture={() => {
					console.log('p onClickCapture');
				}}
				onClick={() => {
					console.log('p onClick');
				}}
			>
				{num}
			</p>
		</div>
	);
	// return <div onClick={() => setNum(num + 1)}>{num}</div>;
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	<App />
);
