import { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';

// * mount时：
// render divRef, null
// dom is : null (这是因为mutation会先解绑ref)
// dom is : <p>Child</p> (layout阶段绑定ref)
// useEffect divRef <div>​…​</div>​ layout阶段后就可以在useEffect中拿到绑定的ref了

// * update时:
// render divRef <div>​</div>​ (点击后setState更新导致app重新render)
// dom is: null (child组件被卸载了，所以执行解绑ref)

function App() {
	const [isDel, del] = useState(false);
	const divRef = useRef(null);

	console.warn('render divRef', divRef.current);

	useEffect(() => {
		console.warn('useEffect divRef', divRef.current);
	}, []);

	return (
		<div ref={divRef} onClick={() => del(true)}>
			{isDel ? null : <Child />}
		</div>
	);
}

function Child() {
	return <p ref={(dom) => console.warn('dom is:', dom)}>Child</p>;
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	<App />
);
