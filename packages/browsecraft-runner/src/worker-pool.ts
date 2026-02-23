// ============================================================================
// Browsecraft Runner — Worker Pool
// Manages a pool of browser instances across one or more browser types.
//
// Each worker is a logical slot that can:
// - Spawn a browser instance
// - Execute work items (tests/scenarios)
// - Report back via the EventBus
// - Be recycled or terminated
//
// The pool supports mixed-browser configurations:
//   2 Chrome + 1 Firefox + 1 Edge = 4 workers total
// ============================================================================

import type { BrowserName, EventBus, WorkItem, WorkItemResult, WorkerInfo } from './event-bus.js';
import { classifyFailure } from './smart-retry.js';

// ---------------------------------------------------------------------------
// Worker State
// ---------------------------------------------------------------------------

export type WorkerState = 'idle' | 'busy' | 'starting' | 'error' | 'terminated';

/** Internal representation of a single worker */
export interface Worker {
	/** Unique worker info (id, browser, index) */
	info: WorkerInfo;
	/** Current state */
	state: WorkerState;
	/** The work item currently being executed (if busy) */
	currentItem: WorkItem | null;
	/** Number of work items completed by this worker */
	completedCount: number;
	/** Timestamp when this worker was spawned */
	spawnedAt: number;
	/** Cleanup function provided by the spawn callback */
	cleanup: (() => Promise<void>) | null;
}

// ---------------------------------------------------------------------------
// Browser Launcher callback
// ---------------------------------------------------------------------------

/**
 * Callback to spawn a browser instance.
 * Returns a cleanup function to tear it down.
 * The actual browser launch is delegated to the caller (CLI/framework layer)
 * to avoid circular dependencies with browsecraft-bidi.
 */
export type BrowserSpawner = (worker: WorkerInfo) => Promise<{
	/** Cleanup function to close the browser */
	close: () => Promise<void>;
}>;

/**
 * Callback to execute a work item on a specific worker.
 * The caller wires this to the actual test execution logic.
 */
export type WorkItemExecutor = (
	item: WorkItem,
	worker: WorkerInfo,
) => Promise<{ status: 'passed' | 'failed' | 'skipped'; duration: number; error?: Error }>;

// ---------------------------------------------------------------------------
// Pool Configuration
// ---------------------------------------------------------------------------

export interface WorkerPoolConfig {
	/** Browser-to-worker-count mapping. e.g. { chrome: 2, firefox: 1 } */
	browsers: Partial<Record<BrowserName, number>>;
	/** Maximum retries per work item (default: 0) */
	maxRetries: number;
	/** Whether to stop all workers on first failure (default: false) */
	bail: boolean;
	/** Timeout for spawning a browser in ms (default: 30000) */
	spawnTimeout: number;
}

const DEFAULT_POOL_CONFIG: WorkerPoolConfig = {
	browsers: { chrome: 1 },
	maxRetries: 0,
	bail: false,
	spawnTimeout: 30_000,
};

// ---------------------------------------------------------------------------
// WorkerPool
// ---------------------------------------------------------------------------

/**
 * Manages a pool of browser workers and distributes work items across them.
 *
 * ```ts
 * const pool = new WorkerPool(bus, {
 *   browsers: { chrome: 2, firefox: 1 },
 *   maxRetries: 1,
 * });
 *
 * await pool.spawn(async (worker) => {
 *   const session = await BiDiSession.launch({ browser: worker.browser });
 *   return { close: () => session.close() };
 * });
 *
 * await pool.execute(items, async (item, worker) => {
 *   // run the test/scenario...
 *   return { status: 'passed', duration: 120 };
 * });
 *
 * await pool.terminate();
 * ```
 */
export class WorkerPool {
	private readonly bus: EventBus;
	private readonly config: WorkerPoolConfig;
	private readonly workers: Worker[] = [];
	private bailed = false;

	constructor(bus: EventBus, config?: Partial<WorkerPoolConfig>) {
		this.bus = bus;
		this.config = { ...DEFAULT_POOL_CONFIG, ...config };
	}

	// -----------------------------------------------------------------------
	// Pool info
	// -----------------------------------------------------------------------

	/** Get a snapshot of all workers */
	getWorkers(): ReadonlyArray<Readonly<Worker>> {
		return this.workers;
	}

	/** Get workers for a specific browser */
	getWorkersForBrowser(browser: BrowserName): ReadonlyArray<Readonly<Worker>> {
		return this.workers.filter((w) => w.info.browser === browser);
	}

	/** Get idle workers */
	getIdleWorkers(): ReadonlyArray<Readonly<Worker>> {
		return this.workers.filter((w) => w.state === 'idle');
	}

	/** Total number of workers across all browsers */
	get size(): number {
		return this.workers.length;
	}

	/** Number of distinct browser types */
	get browserCount(): number {
		return new Set(this.workers.map((w) => w.info.browser)).size;
	}

	/** Get browser names in the pool */
	get browserNames(): BrowserName[] {
		return [...new Set(this.workers.map((w) => w.info.browser))];
	}

	// -----------------------------------------------------------------------
	// Spawn
	// -----------------------------------------------------------------------

	/**
	 * Create all workers and spawn their browser instances.
	 * Workers are created based on the browsers config.
	 */
	async spawn(spawner: BrowserSpawner): Promise<void> {
		const entries = Object.entries(this.config.browsers) as [BrowserName, number][];

		// Create worker descriptors
		for (const [browser, count] of entries) {
			for (let i = 0; i < count; i++) {
				const info: WorkerInfo = {
					id: `${browser}-${i}`,
					browser,
					index: i,
				};
				this.workers.push({
					info,
					state: 'starting',
					currentItem: null,
					completedCount: 0,
					spawnedAt: Date.now(),
					cleanup: null,
				});
				this.bus.emit('worker:spawn', info);
			}
		}

		// Spawn all browsers in parallel
		const spawnPromises = this.workers.map(async (worker) => {
			try {
				const result = await this.withTimeout(
					spawner(worker.info),
					this.config.spawnTimeout,
					`Worker ${worker.info.id} spawn timed out after ${this.config.spawnTimeout}ms`,
				);
				worker.cleanup = result.close;
				worker.state = 'idle';
				this.bus.emit('worker:ready', worker.info);
			} catch (err) {
				worker.state = 'error';
				const error = err instanceof Error ? err : new Error(String(err));
				this.bus.emit('worker:error', { worker: worker.info, error });
				throw error;
			}
		});

		await Promise.all(spawnPromises);
	}

	// -----------------------------------------------------------------------
	// Execute
	// -----------------------------------------------------------------------

	/**
	 * Execute a list of work items across all available workers.
	 * Items are distributed using shortest-queue / round-robin.
	 * Returns all results.
	 */
	async execute(items: WorkItem[], executor: WorkItemExecutor): Promise<WorkItemResult[]> {
		if (items.length === 0) return [];

		const results: WorkItemResult[] = [];
		const queue = [...items]; // mutable copy
		const activeWorkers = this.workers.filter((w) => w.state === 'idle');

		if (activeWorkers.length === 0) {
			throw new Error('No active workers available. Did you call spawn() first?');
		}

		// Emit enqueue events
		for (const item of items) {
			this.bus.emit('item:enqueue', item);
		}

		// Process all items using a work-stealing approach
		const workerPromises = activeWorkers.map((worker) =>
			this.workerLoop(worker, queue, results, executor),
		);

		await Promise.all(workerPromises);

		return results;
	}

	/**
	 * Execute items only on workers for a specific browser.
	 * Used for sequential browser-by-browser execution.
	 */
	async executeOnBrowser(
		browser: BrowserName,
		items: WorkItem[],
		executor: WorkItemExecutor,
	): Promise<WorkItemResult[]> {
		if (items.length === 0) return [];

		const results: WorkItemResult[] = [];
		const queue = [...items];
		const browserWorkers = this.workers.filter(
			(w) => w.info.browser === browser && w.state === 'idle',
		);

		if (browserWorkers.length === 0) {
			throw new Error(`No active workers for browser: ${browser}`);
		}

		for (const item of items) {
			this.bus.emit('item:enqueue', item);
		}

		const workerPromises = browserWorkers.map((worker) =>
			this.workerLoop(worker, queue, results, executor),
		);

		await Promise.all(workerPromises);

		return results;
	}

	// -----------------------------------------------------------------------
	// Worker loop
	// -----------------------------------------------------------------------

	/**
	 * Each worker runs this loop: pull from queue → execute → repeat.
	 * This is the work-stealing pattern — workers pull items themselves.
	 */
	private async workerLoop(
		worker: Worker,
		queue: WorkItem[],
		results: WorkItemResult[],
		executor: WorkItemExecutor,
	): Promise<void> {
		while (queue.length > 0 && !this.bailed) {
			const item = queue.shift();
			if (!item) break;

			worker.state = 'busy';
			worker.currentItem = item;
			this.bus.emit('worker:busy', { worker: worker.info, item });
			this.bus.emit('item:start', { item, worker: worker.info });

			let finalResult: WorkItemResult;

			try {
				const execResult = await executor(item, worker.info);

				finalResult = {
					item,
					worker: worker.info,
					status: execResult.status,
					duration: execResult.duration,
					error: execResult.error,
				};

				// Smart retry — skip retries for non-retryable (deterministic) failures
				if (execResult.status === 'failed' && this.config.maxRetries > 0) {
					const classification = classifyFailure(execResult.error);
					if (classification.retryable) {
						let attempt = 1;
						while (attempt <= this.config.maxRetries && finalResult.status === 'failed') {
							this.bus.emit('item:retry', {
								item,
								worker: worker.info,
								attempt,
								maxRetries: this.config.maxRetries,
							});

							const retryResult = await executor(item, worker.info);
							finalResult = {
								item,
								worker: worker.info,
								status: retryResult.status,
								duration: retryResult.duration,
								error: retryResult.error,
								retries: attempt,
							};
							attempt++;
						}
					}
				}
			} catch (err) {
				const error = err instanceof Error ? err : new Error(String(err));
				finalResult = {
					item,
					worker: worker.info,
					status: 'failed',
					duration: 0,
					error,
				};
			}

			results.push(finalResult);
			worker.completedCount++;
			worker.currentItem = null;
			worker.state = 'idle';

			// Emit result event
			switch (finalResult.status) {
				case 'passed':
					this.bus.emit('item:pass', finalResult);
					break;
				case 'failed':
					this.bus.emit('item:fail', finalResult);
					break;
				case 'skipped':
					this.bus.emit('item:skip', finalResult);
					break;
			}

			this.bus.emit('item:end', finalResult);
			this.bus.emit('worker:idle', worker.info);

			// Bail on first failure if configured
			if (finalResult.status === 'failed' && this.config.bail) {
				this.bailed = true;
				break;
			}
		}
	}

	// -----------------------------------------------------------------------
	// Terminate
	// -----------------------------------------------------------------------

	/**
	 * Gracefully terminate all workers and close their browsers.
	 */
	async terminate(): Promise<void> {
		const closePromises = this.workers.map(async (worker) => {
			if (worker.cleanup) {
				try {
					await worker.cleanup();
				} catch {
					// Best-effort cleanup
				}
			}
			worker.state = 'terminated';
			worker.cleanup = null;
			this.bus.emit('worker:terminate', worker.info);
		});

		await Promise.all(closePromises);
	}

	/**
	 * Reset the pool — clear all workers and state. Used between runs.
	 */
	reset(): void {
		this.workers.length = 0;
		this.bailed = false;
	}

	// -----------------------------------------------------------------------
	// Utilities
	// -----------------------------------------------------------------------

	private withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error(message)), ms);

			promise
				.then((value) => {
					clearTimeout(timer);
					resolve(value);
				})
				.catch((err) => {
					clearTimeout(timer);
					reject(err);
				});
		});
	}
}
