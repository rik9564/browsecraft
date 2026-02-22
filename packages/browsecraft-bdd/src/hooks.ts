// ============================================================================
// BDD Hooks — Before/After lifecycle hooks with tag scoping.
//
// Supports:
// - Before / After (per scenario)
// - BeforeAll / AfterAll (once per run)
// - BeforeFeature / AfterFeature (per feature)
// - BeforeStep / AfterStep (per step)
// - Tag-scoped hooks: Before('@smoke', fn) only runs for @smoke scenarios
// - Named hooks for debugging
// - Priority ordering (lower = runs first)
// - Timeout support
//
// Built from scratch. No Cucumber dependency.
// ============================================================================

import type { StepWorld } from './step-registry.js';
import { tagsMatch } from './tags.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HookScope =
	| 'beforeAll'
	| 'afterAll'
	| 'beforeFeature'
	| 'afterFeature'
	| 'beforeScenario'
	| 'afterScenario'
	| 'beforeStep'
	| 'afterStep';

export interface HookContext {
	/** The StepWorld (page, browser, ctx, etc.) — available for scenario/step hooks */
	world?: StepWorld;
	/** Current feature name */
	featureName?: string;
	/** Current feature tags */
	featureTags?: string[];
	/** Current scenario name */
	scenarioName?: string;
	/** Current scenario tags (includes inherited feature tags) */
	scenarioTags?: string[];
	/** Current step text (only for step hooks) */
	stepText?: string;
	/** Current step keyword (only for step hooks) */
	stepKeyword?: string;
	/** Error from the step (only for afterStep on failure) */
	error?: Error;
	/** Result status of the scenario (only for afterScenario) */
	result?: 'passed' | 'failed' | 'skipped' | 'pending';
}

export type HookFunction = (context: HookContext) => void | Promise<void>;

export interface HookDefinition {
	/** The scope of this hook */
	scope: HookScope;
	/** The hook function */
	fn: HookFunction;
	/** Optional tag filter expression — hook only runs when tags match */
	tagFilter?: string;
	/** Optional name for debugging */
	name?: string;
	/** Priority (lower = runs first). Default: 1000 */
	priority: number;
	/** Timeout in milliseconds. Default: 30000 */
	timeout: number;
}

// ---------------------------------------------------------------------------
// Hook Registry
// ---------------------------------------------------------------------------

export class HookRegistry {
	private hooks: HookDefinition[] = [];

	/**
	 * Register a hook.
	 */
	register(
		scope: HookScope,
		fnOrTag: HookFunction | string,
		maybeFn?: HookFunction,
		options?: { name?: string; priority?: number; timeout?: number },
	): void {
		let tagFilter: string | undefined;
		let fn: HookFunction;

		if (typeof fnOrTag === 'string') {
			// Called as: Before('@smoke', fn)
			tagFilter = fnOrTag;
			if (!maybeFn) {
				throw new Error(`Hook registered with tag filter "${tagFilter}" but no function provided`);
			}
			fn = maybeFn;
		} else {
			// Called as: Before(fn)
			fn = fnOrTag;
		}

		this.hooks.push({
			scope,
			fn,
			tagFilter,
			name: options?.name,
			priority: options?.priority ?? 1000,
			timeout: options?.timeout ?? 30000,
		});
	}

	/**
	 * Get all hooks for a given scope, filtered by tags, sorted by priority.
	 */
	getHooks(scope: HookScope, tags?: string[]): HookDefinition[] {
		return this.hooks
			.filter((h) => h.scope === scope)
			.filter((h) => {
				if (!h.tagFilter) return true;
				if (!tags || tags.length === 0) return false;
				return tagsMatch(h.tagFilter, tags);
			})
			.sort((a, b) => a.priority - b.priority);
	}

	/**
	 * Execute all hooks for a scope.
	 */
	async runHooks(scope: HookScope, context: HookContext): Promise<void> {
		const tags = context.scenarioTags ?? context.featureTags ?? [];
		const hooks = this.getHooks(scope, tags);

		for (const hook of hooks) {
			await this.runSingleHook(hook, context);
		}
	}

	/**
	 * Clear all hooks. Useful for test isolation.
	 */
	clear(): void {
		this.hooks = [];
	}

	/**
	 * Get all registered hooks.
	 */
	getAll(): HookDefinition[] {
		return [...this.hooks];
	}

	// -----------------------------------------------------------------------
	// Internal
	// -----------------------------------------------------------------------

	private async runSingleHook(hook: HookDefinition, context: HookContext): Promise<void> {
		const hookName = hook.name ?? `${hook.scope} hook`;

		// Wrap in a timeout
		const result = hook.fn(context);

		if (result instanceof Promise) {
			await Promise.race([
				result,
				new Promise<never>((_, reject) =>
					setTimeout(
						() => reject(new Error(`${hookName} timed out after ${hook.timeout}ms`)),
						hook.timeout,
					),
				),
			]);
		}
	}
}

// ---------------------------------------------------------------------------
// Global hook registry + convenience functions
// ---------------------------------------------------------------------------

export const globalHookRegistry = new HookRegistry();

/**
 * Register a hook that runs before each scenario.
 *
 * ```ts
 * Before(async ({ world }) => {
 *   await world.page.goto('/');
 * });
 *
 * // With tag filter:
 * Before('@login', async ({ world }) => {
 *   await world.page.goto('/login');
 * });
 * ```
 */
export function Before(fnOrTag: HookFunction | string, maybeFn?: HookFunction): void {
	globalHookRegistry.register('beforeScenario', fnOrTag, maybeFn);
}

/**
 * Register a hook that runs after each scenario.
 *
 * ```ts
 * After(async ({ world, result }) => {
 *   if (result === 'failed') {
 *     await world.page.screenshot({ path: 'failure.png' });
 *   }
 * });
 * ```
 */
export function After(fnOrTag: HookFunction | string, maybeFn?: HookFunction): void {
	globalHookRegistry.register('afterScenario', fnOrTag, maybeFn);
}

/**
 * Register a hook that runs once before all scenarios.
 *
 * ```ts
 * BeforeAll(async () => {
 *   // Setup database, start server, etc.
 * });
 * ```
 */
export function BeforeAll(fn: HookFunction): void {
	globalHookRegistry.register('beforeAll', fn);
}

/**
 * Register a hook that runs once after all scenarios.
 *
 * ```ts
 * AfterAll(async () => {
 *   // Cleanup database, stop server, etc.
 * });
 * ```
 */
export function AfterAll(fn: HookFunction): void {
	globalHookRegistry.register('afterAll', fn);
}

/**
 * Register a hook that runs before each feature.
 *
 * ```ts
 * BeforeFeature(async ({ featureName }) => {
 *   console.log(`Starting feature: ${featureName}`);
 * });
 * ```
 */
export function BeforeFeature(fnOrTag: HookFunction | string, maybeFn?: HookFunction): void {
	globalHookRegistry.register('beforeFeature', fnOrTag, maybeFn);
}

/**
 * Register a hook that runs after each feature.
 */
export function AfterFeature(fnOrTag: HookFunction | string, maybeFn?: HookFunction): void {
	globalHookRegistry.register('afterFeature', fnOrTag, maybeFn);
}

/**
 * Register a hook that runs before each step.
 *
 * ```ts
 * BeforeStep(async ({ stepText }) => {
 *   console.log(`Running step: ${stepText}`);
 * });
 * ```
 */
export function BeforeStep(fnOrTag: HookFunction | string, maybeFn?: HookFunction): void {
	globalHookRegistry.register('beforeStep', fnOrTag, maybeFn);
}

/**
 * Register a hook that runs after each step.
 *
 * ```ts
 * AfterStep(async ({ stepText, error }) => {
 *   if (error) console.log(`Step failed: ${stepText}`);
 * });
 * ```
 */
export function AfterStep(fnOrTag: HookFunction | string, maybeFn?: HookFunction): void {
	globalHookRegistry.register('afterStep', fnOrTag, maybeFn);
}
