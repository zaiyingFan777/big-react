import React from 'react';
import ReactDOM from 'react-dom/client';

// * 3.
function App() {
	return (
		<div>
			<Child />
		</div>
	);
}

function Child() {
	return <span>big-react</span>;
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	<App />
);

// * 1.测试一
// const jsx = (
// 	<div>
// 		<span>big-react</span>
// 	</div>
// );

// ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(jsx);

// console.log(React);
// console.log(jsx);
// console.log(ReactDOM);

// * 2.测试二
// function App() {
// 	return (
// 		<div>
// 			<span>big-react</span>
// 		</div>
// 	);
// }

// ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
// 	<App />
// );
