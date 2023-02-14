import reactDomConfig from './react-dom.config';
import reactNoopRenderer from './react-noop-renderer.config';
import reactConfig from './react.config';

export default () => {
	return [...reactConfig, ...reactDomConfig, ...reactNoopRenderer];
};
