import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';

console.log(import.meta.hot);

function App() {
	const [num] = useState(100);
	console.log(num, 'app');
	return <div>{num}</div>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
