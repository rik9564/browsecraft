// ============================================================================
// Browsecraft Runner - Public API
// Test discovery, execution, reporting, and parallel orchestration.
// ============================================================================

export { TestRunner } from './runner.js';
export type { RunnableTest, TestExecutor } from './runner.js';
export type { RunnerOptions, TestResult, RunSummary, BrowsecraftConfig } from './types.js';

// Parallel execution engine
export { EventBus } from './event-bus.js';
export type {
	BrowserName,
	WorkerInfo,
	WorkItem,
	WorkItemResult,
	RunnerEvents,
	EventListener,
} from './event-bus.js';

export { WorkerPool } from './worker-pool.js';
export type {
	Worker,
	WorkerState,
	BrowserSpawner,
	WorkItemExecutor,
	WorkerPoolConfig,
} from './worker-pool.js';

export { Scheduler } from './scheduler.js';
export type {
	ExecutionStrategy,
	SchedulerConfig,
	BrowserResult,
	SchedulerResult,
} from './scheduler.js';

export { ResultAggregator } from './result-aggregator.js';
export type {
	ScenarioMatrixRow,
	MatrixCell,
	TimingStats,
	AggregatedSummary,
} from './result-aggregator.js';

// Smart retry — failure classification
export { classifyFailure } from './smart-retry.js';
export type { FailureCategory, FailureClassification } from './smart-retry.js';
