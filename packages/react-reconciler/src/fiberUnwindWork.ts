import { FiberNode } from './fiber';
import { popProvider } from './fiberContext';
import { DidCapture, NoFlags, ShouldCapture } from './fiberFlags';
import { popSuspenseHandler } from './suspenseContext';
import { ContextProvider, SuspenseComponent } from './workTags';

export function unwindWork(wip: FiberNode) {
	const flags = wip.flags;

	switch (wip.tag) {
		case SuspenseComponent:
			// unwind和completework都是向上寻找的过程，需要让suspense出栈
			popSuspenseHandler();
			if (
				(flags & ShouldCapture) !== NoFlags &&
				(flags & DidCapture) === NoFlags
			) {
				// 被标记了ShouldCapture 同时 没有标记DidCapture
				// 这就是找到了抛出错误离当前fiber最近的suspense

				// 标记flag 移除ShouldCapture并添加DidCapture
				wip.flags = (flags & ~ShouldCapture) | DidCapture;
				// 返回这个suspense
				return wip;
			}
			return null;

		// unwind流程需要处理context，因为context也是一个栈
		case ContextProvider:
			const context = wip.type._context;
			popProvider(context);
			return null;
		default:
			return null;
	}
}
