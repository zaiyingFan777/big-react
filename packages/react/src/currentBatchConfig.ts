// 放在react内部共享层
interface BatchConfig {
	transition: number | null;
}

const ReactCurrentBatchConfig: BatchConfig = {
	transition: null
};

export default ReactCurrentBatchConfig;
