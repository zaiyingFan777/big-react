import { useState, useContext, createContext, useMemo, memo } from 'react';

// 未做任何优化 只有点击的时候hostRootFiber会bailout，但是app内部state发生变化了，所以会重新reconcile他的子孙组件(ExpensiveSubtree函数会重新执行生成新的jsx新的props对象)
// 所以会app、expensiveSubtree都会打印render

// 无论是mount、点击
// // 都会打印App render、ExpensiveSubtree render(因为div reconcile会重新执行ExpensiveSubtree,然后他的props为不同的{})
// export default function App() {
// 	const [num, update] = useState(0);
// 	console.log('App render ', num);

// 	return (
// 		<div onClick={() => update(num + 100)}>
// 			<p>num is: {num}</p>
// 			<ExpensiveSubtree />
// 		</div>
// 	);
// }

// function ExpensiveSubtree() {
// 	console.log('ExpensiveSubtree render');
// 	return <p>i am child</p>;
// }

// 方式1：App提取 bailout四要素
// mount打印：
// App render
// ExpensiveSubtree render
// 无论怎么点击都不会打印app render、ExpensiveSubtree render
// bailout 1.bailout hostRootfiber，返回wip app，那么app的props前后是不会变的，因为克隆
// bailout 2.bailout app fiber 满足四要素，返回wip Num，那么Num的前后props是不变的，因为克隆
// 3.bailout Num fiber props type不变，但是内部有state而且状态发生变化，因此Num会进行reconcileChildren
// 4.bailout div fiber props变化了因为上面Num生成children是经过reconcile，所以不能进行bailout
// 5.bailout p fiber props变化了因为上面div生成children是经过reconcile，所以不能进行bailout
// 6.bailout hostText fiber props变化了因为上面p生成children是经过reconcile，所以不能进行bailout
// 7.bailout hostText fiber props变化了因为上面p生成children是经过reconcile，所以不能进行bailout
// bailout整颗子树 8.bailout ExpensiveSubtree fiber props没有变化是因为他是作为children被传递进来的，而且Num是App bailout的时候克隆的children因此，Num的props(Expensive)都没有变化
// 因此ExpensiveSubtree的props也没有发生改变，因此可以bailout，并且是bailout整颗子树
// export default function App() {
// 	console.log('App render ');

// 	return (
// 		<Num>
// 			<ExpensiveSubtree />
// 		</Num>
// 	);
// }
// // jsx
// // import { jsx as _jsx } from "react/jsx-runtime";
// // function App() {
// //   console.log('App render ');
// //   return /*#__PURE__*/_jsx(Num, {
// //     children: /*#__PURE__*/_jsx(ExpensiveSubtree, {})
// //   });
// // }

// function Num({ children }) {
// 	const [num, update] = useState(0);
// 	// console.log('Num render ', num);
// 	return (
// 		<div onClick={() => update(num + 100)}>
// 			<p>num is: {num}</p>
// 			{children}
// 		</div>
// 	);
// }

// function ExpensiveSubtree() {
// 	console.log('ExpensiveSubtree render');
// 	return <p>i am child</p>;
// }

// 方式2：ExpensiveSubtree用memo包裹
// mount打印：
// App render  0
// ExpensiveSubtree render
// 点击
// bailout hostRootFiber
// App render 100
// bailout ExpensiveSubtree整颗子树
// 虽然APP会render，但是因为我们生成的 Cpn 是useMemo包裹的，因此ExpensiveSubtree的props不会发生变化（依赖项），因此可以bailout
// mount时生成Cpn为ExpensiveSubtree的reactElement，update时，我们从fiber hook中取出来mount时生成的ExpensiveSubtree的reactElement
// 因为没有依赖项，也就没有依赖项的变化
export default function App() {
	const [num, update] = useState(0);
	console.log('App render ', num);

	const Cpn = useMemo(() => <ExpensiveSubtree />, []);

	return (
		<div onClick={() => update(num + 100)}>
			<p>num is: {num}</p>
			{Cpn}
		</div>
	);
}

function ExpensiveSubtree() {
	console.log('ExpensiveSubtree render');
	return <p>i am child</p>;
}

// jsx
// import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// export default function App() {
//   const [num, update] = useState(0);
//   console.log('App render ', num);
//   const Cpn = useMemo(() => /*#__PURE__*/_jsx(ExpensiveSubtree, {}), []);
//   return /*#__PURE__*/_jsxs("div", {
//     onClick: () => update(num + 100),
//     children: [/*#__PURE__*/_jsxs("p", {
//       children: ["num is: ", num]
//     }), Cpn] // 这里Cpn其实是useMemo执行后的_jsx(xxx)执行后的ReactElement
//   });
// }
// function ExpensiveSubtree() {
//   console.log('ExpensiveSubtree render');
//   return /*#__PURE__*/_jsx("p", {
//     children: "i am child"
//   });
// }

// memo浅比较，比较两个不同的{} {}也是true详见对应的浅比较
// // Expensive bailout整颗子树
// export default function App() {
// 	const [num, update] = useState(0);
// 	console.log('App render ', num);

// 	// const Cpn = useMemo(() => <ExpensiveSubtree />, []);

// 	return (
// 		<div onClick={() => update(num + 100)}>
// 			<p>num is: {num}</p>
// 			<ExpensiveSubtree />
// 		</div>
// 	);
// }

// const ExpensiveSubtree = memo(function () {
// 	console.log('ExpensiveSubtree render');
// 	return <p>i am child</p>;
// });
