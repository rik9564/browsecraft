// ============================================================================
// Browsecraft Runner — Scheduler
// Orchestrates test execution across browsers and worker pools.
//
// Supports three execution strategies:
// 1. PARALLEL   — all browsers simultaneously, scenarios distributed
// 2. SEQUENTIAL — one browser at a time, each browser gets all scenarios
// 3. MATRIX     — every scenario × every browser (cross-browser validation)
//
// The scheduler is the top-level coordination layer. It:
// - Splits work items per browser
// - Delegates to WorkerPool for actual execution
// - Emits high-level lifecycle events
// - Collects and returns the complete result matrix
// ============================================================================

import type { BrowserName, EventBus, WorkItem, WorkItemResult } from './event-bus.js';

import type { WorkItemExecutor, WorkerPool } from './worker-pool.js';

// ---------------------------------------------------------------------------
// Execution Strategy
// ---------------------------------------------------------------------------

/**
 * How scenarios are distributed across browsers:
 *
 * - `parallel`:   All browser pools run at once, scenarios spread across them.
 *                 Fastest option. Use when tests are browser-independent.
 *
 * - `sequential`: Browsers run one at a time. Each gets the full scenario set.
 *                 Use when you need isolated browser runs or limited resources.
 *
 * - `matrix`:     Every scenario runs on every browser. Full cross-browser coverage.
 *                 Scenarios × Browsers = total executions.
 */
export type ExecutionStrategy = 'parallel' | 'sequential' | 'matrix';

// ---------------------------------------------------------------------------
// Scheduler Configuration
// ---------------------------------------------------------------------------

export interface SchedulerConfig {
	/** How to distribute work (default: 'matrix') */
	strategy: ExecutionStrategy;
	/** Tag filter expression for BDD scenarios */
	tagFilter?: string;
	/** Grep filter for test titles */
	grep?: string;
}

const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
	strategy: 'matrix',
};

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/** Results grouped by browser */
export interface BrowserResult {
	browser: BrowserName;
	results: WorkItemResult[];
	passed: number;
	failed: number;
	skipped: number;
	duration: number;
}

/** Complete execution result — the matrix */
export interface SchedulerResult {
	/** Results per browser */
	browsers: BrowserResult[];
	/** All results flattened */
	allResults: WorkItemResult[];
	/** Total counts */
	totalPassed: number;
	totalFailed: number;
	totalSkipped: number;
	totalDuration: number;
	/** The strategy used */
	strategy: ExecutionStrategy;
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

/**
 * High-level execution scheduler.
 *
 * ```ts
 * const scheduler = new Scheduler(bus, pool, {
 *   strategy: 'matrix',
 * });
 *
 * const result = await scheduler.run(scenarios, executor);
 *
 * console.log(`${result.totalPassed} passed across ${result.browsers.length} browsers`);
 * ```
 */
export class Scheduler {
	private readonly bus: EventBus;
	private readonly pool: WorkerPool;
	private readonly config: SchedulerConfig;

	constructor(bus: EventBus, pool: WorkerPool, config?: Partial<SchedulerConfig>) {
		this.bus = bus;
		this.pool = pool;
		this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...config };
	}

	// -----------------------------------------------------------------------
	// Run
	// -----------------------------------------------------------------------

	/**
	 * Execute work items according to the configured strategy.
	 */
	async run(items: WorkItem[], executor: WorkItemExecutor): Promise<SchedulerResult> {
		const startTime = Date.now();
		const browsers = this.pool.browserNames;

		// Apply grep filter
		const filteredItems = this.applyFilters(items);

		// Emit run start
		this.bus.emit('run:start', {
			browsers,
			totalItems: filteredItems.length,
			workers: this.pool.size,
		});

		let allResults: WorkItemResult[];

		switch (this.config.strategy) {
			case 'parallel':
				allResults = await this.runParallel(filteredItems, executor, browsers);
				break;
			case 'sequential':
				allResults = await this.runSequential(filteredItems, executor, browsers);
				break;
			case 'matrix':
				allResults = await this.runMatrix(filteredItems, executor, browsers);
				break;
			default:
				throw new Error(`Unknown execution strategy: ${this.config.strategy}`);
		}

		const totalDuration = Date.now() - startTime;

		// Build result
		const schedulerResult = this.buildResult(allResults, browsers, totalDuration);

		// Emit run end
		this.bus.emit('run:end', {
			duration: totalDuration,
			results: allResults,
		});

		return schedulerResult;
	}

	// -----------------------------------------------------------------------
	// Strategies
	// -----------------------------------------------------------------------

	/**
	 * PARALLEL: All workers across all browsers pull from a single shared queue.
	 * Scenarios are distributed across all available workers.
	 * A scenario may run on any browser — depends on which worker picks it up.
	 */
	private async runParallel(
		items: WorkItem[],
		executor: WorkItemExecutor,
		browsers: BrowserName[],
	): Promise<WorkItemResult[]> {
		for (const browser of browsers) {
			const workerCount = this.pool.getWorkersForBrowser(browser).length;
			this.bus.emit('browser:start', {
				browser,
				workerCount,
				itemCount: items.length,
			});
		}

		const results = await this.pool.execute(items, executor);

		// Emit browser end events
		for (const browser of browsers) {
			const browserResults = results.filter((r) => r.worker.browser === browser);
			this.bus.emit('browser:end', {
				browser,
				passed: browserResults.filter((r) => r.status === 'passed').length,
				failed: browserResults.filter((r) => r.status === 'failed').length,
				skipped: browserResults.filter((r) => r.status === 'skipped').length,
				duration: browserResults.reduce((sum, r) => sum + r.duration, 0),
			});
		}

		return results;
	}

	/**
	 * SEQUENTIAL: One browser at a time. Each browser gets the full scenario set.
	 * Useful for isolated browser runs or resource-constrained environments.
	 */
	private async runSequential(
		items: WorkItem[],
		executor: WorkItemExecutor,
		browsers: BrowserName[],
	): Promise<WorkItemResult[]> {
		const allResults: WorkItemResult[] = [];

		for (const browser of browsers) {
			const workerCount = this.pool.getWorkersForBrowser(browser).length;

			this.bus.emit('browser:start', {
				browser,
				workerCount,
				itemCount: items.length,
			});

			const browserStart = Date.now();
			const results = await this.pool.executeOnBrowser(browser, items, executor);
			allResults.push(...results);

			this.bus.emit('browser:end', {
				browser,
				passed: results.filter((r) => r.status === 'passed').length,
				failed: results.filter((r) => r.status === 'failed').length,
				skipped: results.filter((r) => r.status === 'skipped').length,
				duration: Date.now() - browserStart,
			});
		}

		return allResults;
	}

	/**
	 * MATRIX: Every scenario runs on every browser.
	 * Total executions = scenarios × browsers.
	 * Within each browser, scenarios run in parallel across that browser's workers.
	 *
	 * This is the gold standard for cross-browser testing — guarantees
	 * every scenario is validated on every browser.
	 */
	private async runMatrix(
		items: WorkItem[],
		executor: WorkItemExecutor,
		browsers: BrowserName[],
	): Promise<WorkItemResult[]> {
		// If only one browser, matrix and parallel are the same
		if (browsers.length <= 1) {
			return this.runParallel(items, executor, browsers);
		}

		// Run all browsers in parallel, each with the full item set
		const browserPromises = browsers.map(async (browser) => {
			const workerCount = this.pool.getWorkersForBrowser(browser).length;

			this.bus.emit('browser:start', {
				browser,
				workerCount,
				itemCount: items.length,
			});

			// Create copies of items for this browser (they'll share the same IDs
			// but that's OK — the WorkerInfo distinguishes them in results)
			const browserItems = items.map((item) => ({ ...item }));
			const browserStart = Date.now();

			const results = await this.pool.executeOnBrowser(browser, browserItems, executor);

			this.bus.emit('browser:end', {
				browser,
				passed: results.filter((r) => r.status === 'passed').length,
				failed: results.filter((r) => r.status === 'failed').length,
				skipped: results.filter((r) => r.status === 'skipped').length,
				duration: Date.now() - browserStart,
			});

			return results;
		});

		const browserResultSets = await Promise.all(browserPromises);
		return browserResultSets.flat();
	}

	// -----------------------------------------------------------------------
	// Filtering
	// -----------------------------------------------------------------------

	/**
	 * Apply grep and tag filters to work items.
	 */
	private applyFilters(items: WorkItem[]): WorkItem[] {
		let filtered = items;

		// Grep filter — match against title
		if (this.config.grep) {
			const pattern = this.config.grep;
			filtered = filtered.filter((item) => item.title.includes(pattern));
		}

		// Tag filter — match against tags (BDD scenarios)
		if (this.config.tagFilter) {
			const tagExpr = this.config.tagFilter.toLowerCase();
			filtered = filtered.filter((item) => {
				if (!item.tags || item.tags.length === 0) return false;
				const itemTags = item.tags.map((t) => t.toLowerCase());
				return this.matchTagExpression(itemTags, tagExpr);
			});
		}

		return filtered;
	}

	/**
	 * Simple tag expression matcher.
	 * Supports: @tag, @tag1 and @tag2, @tag1 or @tag2, not @tag
	 */
	private matchTagExpression(tags: string[], expression: string): boolean {
		// Handle "and"
		if (expression.includes(' and ')) {
			return expression.split(' and ').every((part) => this.matchTagExpression(tags, part.trim()));
		}

		// Handle "or"
		if (expression.includes(' or ')) {
			return expression.split(' or ').some((part) => this.matchTagExpression(tags, part.trim()));
		}

		// Handle "not"
		if (expression.startsWith('not ')) {
			return !this.matchTagExpression(tags, expression.slice(4).trim());
		}

		// Direct tag match
		const tag = expression.startsWith('@') ? expression : `@${expression}`;
		return tags.includes(tag);
	}

	// -----------------------------------------------------------------------
	// Result building
	// -----------------------------------------------------------------------

	/**
	 * Build the final SchedulerResult from collected results.
	 */
	private buildResult(
		allResults: WorkItemResult[],
		browsers: BrowserName[],
		totalDuration: number,
	): SchedulerResult {
		const browserResults: BrowserResult[] = browsers.map((browser) => {
			const results = allResults.filter((r) => r.worker.browser === browser);
			return {
				browser,
				results,
				passed: results.filter((r) => r.status === 'passed').length,
				failed: results.filter((r) => r.status === 'failed').length,
				skipped: results.filter((r) => r.status === 'skipped').length,
				duration: results.reduce((sum, r) => sum + r.duration, 0),
			};
		});

		return {
			browsers: browserResults,
			allResults,
			totalPassed: allResults.filter((r) => r.status === 'passed').length,
			totalFailed: allResults.filter((r) => r.status === 'failed').length,
			totalSkipped: allResults.filter((r) => r.status === 'skipped').length,
			totalDuration,
			strategy: this.config.strategy,
		};
	}
}
