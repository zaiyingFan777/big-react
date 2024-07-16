import { useState, memo } from 'react';

export default function App() {
	const [num, update] = useState(0);
	console.log('App render ', num);
	return (
		<div onClick={() => update(num + 1)}>
			<Cpn num={num} name={'cpn1'} />
			<Cpn num={0} name={'cpn2'} />
		</div>
	);
}

const Cpn = memo(function ({ num, name }) {
	console.log('render ', name);
	return (
		<div>
			{name}: {num}
			<Child />
		</div>
	);
});

function Child() {
	console.log('Child render');
	return <p>i am child</p>;
}

// 初始打印：
// App render  0
// render  cpn1
// Child render
// render  cpn2
// Child render

// 第一次点击
// App render  1
// render  cpn1
// Child render

// 第2次点击
// App render  2
// render  cpn1
// Child render
