import { useState } from 'react';
import ReactDOM from 'react-dom/client';

// vite热更新，告诉vite哪里变了
console.log(import.meta.hot);

function App() {
	const [num, setNum] = useState(100);
	window.setNum = setNum;

	return num === 3 ? <Child /> : <div>{num}</div>;
}

function Child() {
	return <span>big-react</span>;
}

console.log(<App />);

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	<App />
);
