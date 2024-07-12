import { useState, useContext, createContext, memo } from 'react';

// 未性能优化写法
export default function App() {
	const [num, update] = useState(0);
	console.log('App render ', num);

	return (
		<div>
			<button onClick={() => update(num + 1)}>+ 1</button>
			<p>num is: {num}</p>
			<ExpensiveSubtree />
		</div>
	);
}

function ExpensiveSubtree() {
	console.log('ExpensiveSubtree render');
	return <p>i am child</p>;
}

// 性能优化写法
// export function App() {
// 	console.log('App render');

// 	return (
// 		<div>
// 			<Num />
// 			<ExpensiveSubtree />
// 		</div>
// 	);
// }
// // 将变化的部分拆分
// function Num() {
// 	const [num, update] = useState(0);
// 	return (
// 		<>
// 			<button onClick={() => update(num + 1)}>+1</button>
// 			<p>num is : {num}</p>
// 		</>
// 	);
// }
// function ExpensiveSubtree() {
// 	console.log('ExpensiveSubtree render');
// 	return <div>i am child</div>;
// }
