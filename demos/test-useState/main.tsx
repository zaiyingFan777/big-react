import { useState } from 'react';
import ReactDOM from 'react-dom/client';

console.log(import.meta.hot);

// * 测试mount时期的useState
function App() {
	const [num, setNum] = useState(100);
	window.setNum = setNum;
	return num === 3 ? <Child /> : <div>{num}</div>;
}

function Child() {
	return <span>big-react</span>;
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	<App />
);
