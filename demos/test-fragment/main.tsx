// import { useState } from 'react';
// import ReactDOM from 'react-dom/client';

// function App() {
// 	const [num, setNum] = useState(100);
// 	const arr =
// 		num % 2 === 0
// 			? [<li key="1">1</li>, <li key="2">2</li>, <li key="3">3</li>]
// 			: [<li key="3">3</li>, <li key="2">2</li>, <li key="1">1</li>];
// 	// 1. Fragment包裹其他组件
// 	// return (
// 	// 	<>
// 	// 		<div>1</div>
// 	// 		<div>2</div>
// 	// 	</>
// 	// );
// 	// 2.Fragment与其他组件同级
// 	// children为数组类型，则进入reconcileChildrenArray方法，数组中的某一项为Fragment，所以需要增加「type为Fragment的ReactElement的判断」，同时beginWork中需要增加Fragment类型的判断。
// 	// return (
// 	// 	<ul>
// 	// 		<>
// 	// 			<li>1</li>
// 	// 			<li>2</li>
// 	// 		</>
// 	// 		<li>3</li>
// 	// 		<li>4</li>
// 	// 	</ul>
// 	// );
// 	// 3. 数组形式的Fragment
// 	// children为数组类型，则进入reconcileChildrenArray方法，数组中的某一项为数组，所以需要增加「reconcileChildrenArray中数组类型的判断」。
// 	return (
// 		<ul onClickCapture={() => setNum(num + 1)}>
// 			<li>4</li>
// 			<li>5</li>
// 			{arr}
// 		</ul>
// 	);
// }

// ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
// 	<App />
// );

// 嵌套数组
import { useState } from 'react';
import ReactDOM from 'react-dom/client';

function App() {
	const [num, setNum] = useState(100);
	const arr =
		num % 2 === 0
			? [
					<ul>
						<li key="1">1</li>
						<li key="2">2</li>
						<li key="3">3</li>
						123
					</ul>
			  ]
			: [
					<ul>
						<li key="3">3</li>
						<li key="2">2</li>
						<li key="1">1</li>
						321
					</ul>
			  ];

	return (
		<ul onClickCapture={() => setNum(num + 1)}>
			{arr}
			<li>4</li>
			<li>5</li>
		</ul>
	);
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	<App />
);
