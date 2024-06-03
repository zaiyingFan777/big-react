import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';

console.log(import.meta.hot);

// function App() {
// 	const [num, setNum] = useState(100);
// 	window.setNum = setNum;
// 	// console.log(num, 'app');
// 	return <div>{num}</div>;
// }

function App() {
	const [num, setNum] = useState(100);
	window.setNum = setNum;
	// console.log(num, 'app');
	return num === 3 ? <Child /> : <div>{num}</div>;
}

function Child() {
	return <span>big-react</span>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
