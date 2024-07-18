import { useState, useContext, createContext, memo } from 'react';

const ctx = createContext(0);

// 没有实现context兼容bailout策略的打印
// mount时
// app render 0
// cpn render
// child render

// 点击
// bailout hostRootFiber
// app render 1
// bailout 整颗子树memo Cpn 因此Child组件没有render也就没有读取变化的context.value

// 实现了context兼容bailout策略的打印
// mount时
// App render  0
// Cpn render
// Child render

// 点击
// bailout hostRootFiber
// App render  1
// bailout memo
// bailout Cpn下的div 因为cpn被memo包裹但是childlanes有值只能bailout一个组件不能是整颗子树得到div wip,wipdiv的props type state context都没变 因此也是bailout
// 上面没有bailout整颗子树，clone wip Child，这样Child的props不变，但是Child的lanes为1（context变化）只能走reconcile

export default function App() {
	const [num, update] = useState(0);
	console.log('App render ', num);
	return (
		<ctx.Provider value={num}>
			<div
				onClick={() => {
					update(1);
				}}
			>
				<Cpn />
			</div>
		</ctx.Provider>
	);
}

const Cpn = memo(function () {
	console.log('Cpn render');
	return (
		<div>
			<Child />
		</div>
	);
});

function Child() {
	console.log('Child render');
	const val = useContext(ctx);

	return <div>ctx: {val}</div>;
}
