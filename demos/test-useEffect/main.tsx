import { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';

function App() {
	const [num, updateNum] = useState(0);
	useEffect(() => {
		console.log('\x1B[32mApp mount\x1B[0m');
	}, []);

	useEffect(() => {
		console.log('\x1B[32mnum change create\x1B[0m', num);
		return () => {
			console.log('\x1B[32mnum change destroy\x1B[0m', num);
		};
	}, [num]);

	return (
		<div onClick={() => updateNum(num + 1)}>
			{num === 0 ? <Father /> : 'noop'}
		</div>
	);
}

function Father() {
	useEffect(() => {
		console.log('\x1B[32mFather mount\x1B[0m');
		return () => console.log('\x1B[32mFather unmount\x1B[0m');
	}, []);

	return <Child />;
}

function Child() {
	useEffect(() => {
		console.log('\x1B[32mChild mount\x1B[0m');
		return () => console.log('\x1B[32mChild unmount\x1B[0m');
	}, []);

	return 'i am child';
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	<App />
);
