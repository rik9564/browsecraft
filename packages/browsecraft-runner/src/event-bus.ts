// ============================================================================
// Browsecraft Runner — EventBus
// Decoupled, type-safe event system for the execution engine.
// CLI, UI runner, and reporters all plug into these events.
// ============================================================================

/** Browser identifier — same as Browsecraft BiDi BrowserName */
export type BrowserName = 'chrome' | 'firefox' | 'edge';

// ---------------------------------------------------------------------------
// Event Payloads
// ---------------------------------------------------------------------------

/** Identifies a single worker instance */
export interface WorkerInfo {
	/** Unique worker ID (e.g. "chrome-0", "firefox-2") */
	id: string;
	/** Which browser this worker runs */
	browser: BrowserName;
	/** 0-based index within its browser pool */
	index: number;
}

/** Describes a work item (scenario/test) assigned to a worker */
export interface WorkItem {
	/** Unique item ID */
	id: string;
	/** Human-readable title */
	title: string;
	/** Source file path */
	file: string;
	/** Line number in the source file (for scenarios) */
	line?: number;
	/** Tags (for BDD scenarios) */
	tags?: string[];
	/** Suite/feature hierarchy path */
	suitePath: string[];
}

/** Result of executing a single work item */
export interface WorkItemResult {
	/** The work item that was executed */
	item: WorkItem;
	/** Which worker ran it */
	worker: WorkerInfo;
	/** Execution status */
	status: 'passed' | 'failed' | 'skipped';
	/** Duration in milliseconds */
	duration: number;
	/** Error if failed */
	error?: Error;
	/** Number of retry attempts used */
	retries?: number;
}

// ---------------------------------------------------------------------------
// Event Map — every event and its payload
// ---------------------------------------------------------------------------

export interface RunnerEvents {
	// Run lifecycle
	'run:start': { browsers: BrowserName[]; totalItems: number; workers: number };
	'run:end': { duration: number; results: WorkItemResult[] };

	// Worker lifecycle
	'worker:spawn': WorkerInfo;
	'worker:ready': WorkerInfo;
	'worker:busy': { worker: WorkerInfo; item: WorkItem };
	'worker:idle': WorkerInfo;
	'worker:error': { worker: WorkerInfo; error: Error };
	'worker:terminate': WorkerInfo;

	// Work item lifecycle
	'item:enqueue': WorkItem;
	'item:start': { item: WorkItem; worker: WorkerInfo };
	'item:pass': WorkItemResult;
	'item:fail': WorkItemResult;
	'item:skip': WorkItemResult;
	'item:retry': { item: WorkItem; worker: WorkerInfo; attempt: number; maxRetries: number };
	'item:end': WorkItemResult;

	// Browser-level grouping
	'browser:start': { browser: BrowserName; workerCount: number; itemCount: number };
	'browser:end': {
		browser: BrowserName;
		passed: number;
		failed: number;
		skipped: number;
		duration: number;
	};

	// Progress
	'progress': {
		completed: number;
		total: number;
		passed: number;
		failed: number;
		skipped: number;
		elapsed: number;
	};
}

// ---------------------------------------------------------------------------
// Listener type helper
// ---------------------------------------------------------------------------

export type EventListener<K extends keyof RunnerEvents> = (payload: RunnerEvents[K]) => void;

// ---------------------------------------------------------------------------
// EventBus
// ---------------------------------------------------------------------------

/**
 * Type-safe, synchronous event bus for the execution engine.
 *
 * The bus decouples the scheduler/worker pool from reporters and the UI.
 * All events are emitted synchronously so listeners always see them in order.
 *
 * ```ts
 * const bus = new EventBus();
 * bus.on('item:pass', ({ item, duration }) => { ... });
 * bus.on('run:end', ({ results }) => { ... });
 * ```
 */
export class EventBus {
	private listeners = new Map<string, Set<EventListener<never>>>();
	private history: Array<{ event: string; payload: unknown; timestamp: number }> = [];
	private _recordHistory = false;

	// -----------------------------------------------------------------------
	// Subscription
	// -----------------------------------------------------------------------

	/**
	 * Register a listener for an event.
	 * Returns an unsubscribe function for easy cleanup.
	 */
	on<K extends keyof RunnerEvents>(event: K, listener: EventListener<K>): () => void {
		let set = this.listeners.get(event);
		if (!set) {
			set = new Set();
			this.listeners.set(event, set);
		}
		set.add(listener as EventListener<never>);

		return () => {
			set!.delete(listener as EventListener<never>);
			if (set!.size === 0) this.listeners.delete(event);
		};
	}

	/**
	 * Register a one-time listener. Automatically removed after first call.
	 */
	once<K extends keyof RunnerEvents>(event: K, listener: EventListener<K>): () => void {
		const unsubscribe = this.on(event, ((payload: RunnerEvents[K]) => {
			unsubscribe();
			listener(payload);
		}) as EventListener<K>);
		return unsubscribe;
	}

	/**
	 * Remove all listeners for a specific event, or all events.
	 */
	off<K extends keyof RunnerEvents>(event?: K): void {
		if (event) {
			this.listeners.delete(event);
		} else {
			this.listeners.clear();
		}
	}

	// -----------------------------------------------------------------------
	// Emission
	// -----------------------------------------------------------------------

	/**
	 * Emit an event synchronously to all registered listeners.
	 */
	emit<K extends keyof RunnerEvents>(event: K, payload: RunnerEvents[K]): void {
		if (this._recordHistory) {
			this.history.push({ event, payload, timestamp: Date.now() });
		}

		const set = this.listeners.get(event);
		if (!set) return;

		for (const listener of set) {
			try {
				(listener as EventListener<K>)(payload);
			} catch {
				// Listeners must not break the execution pipeline
			}
		}
	}

	// -----------------------------------------------------------------------
	// Introspection
	// -----------------------------------------------------------------------

	/**
	 * Get the number of listeners for a specific event, or all events.
	 */
	listenerCount(event?: keyof RunnerEvents): number {
		if (event) {
			return this.listeners.get(event)?.size ?? 0;
		}
		let total = 0;
		for (const set of this.listeners.values()) {
			total += set.size;
		}
		return total;
	}

	/**
	 * Get the names of all events that have listeners.
	 */
	eventNames(): string[] {
		return Array.from(this.listeners.keys());
	}

	// -----------------------------------------------------------------------
	// History (for debugging / test assertions)
	// -----------------------------------------------------------------------

	/**
	 * Enable event history recording. Useful for tests and debugging.
	 */
	enableHistory(): void {
		this._recordHistory = true;
	}

	/**
	 * Disable event history recording and clear existing history.
	 */
	disableHistory(): void {
		this._recordHistory = false;
		this.history = [];
	}

	/**
	 * Get recorded events. Only available when history is enabled.
	 */
	getHistory(): ReadonlyArray<{ event: string; payload: unknown; timestamp: number }> {
		return this.history;
	}

	/**
	 * Get events of a specific type from history.
	 */
	getEventsOfType<K extends keyof RunnerEvents>(
		event: K,
	): Array<{ payload: RunnerEvents[K]; timestamp: number }> {
		return this.history
			.filter((h) => h.event === event)
			.map((h) => ({ payload: h.payload as RunnerEvents[K], timestamp: h.timestamp }));
	}

	/**
	 * Clear all history without disabling recording.
	 */
	clearHistory(): void {
		this.history = [];
	}
}
