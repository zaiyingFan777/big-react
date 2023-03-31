import ReactDOM from 'react-dom';

import { useState, useTransition } from 'react';
import TabButton from './TabButton';
import AboutTab from './AboutTab';
import PostsTab from './PostsTab';
import ContactTab from './ContactTab';
import './style.css';

function App() {
	const [isPending, startTransition] = useTransition();
	const [tab, setTab] = useState('about');
	console.log('hello');
	function selectTab(nextTab) {
		startTransition(() => {
			// 这里会更新两次，内部setPending 以及callback中的setTab、setPending的批处理
			setTab(nextTab);
		});
	}

	return (
		<>
			<TabButton isActive={tab === 'about'} onClick={() => selectTab('about')}>
				首页
			</TabButton>
			<TabButton isActive={tab === 'posts'} onClick={() => selectTab('posts')}>
				博客 (render慢)
			</TabButton>
			<TabButton
				isActive={tab === 'contact'}
				onClick={() => selectTab('contact')}
			>
				联系我
			</TabButton>
			<hr />
			{tab === 'about' && <AboutTab />}
			{tab === 'posts' && <PostsTab />}
			{tab === 'contact' && <ContactTab />}
		</>
	);
}

const root = ReactDOM.createRoot(document.querySelector('#root'));

root.render(<App />);
