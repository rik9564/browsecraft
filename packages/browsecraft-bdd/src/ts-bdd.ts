// ============================================================================
// TypeScript-Native BDD Mode — write BDD tests in pure TypeScript.
//
// No .feature files needed. Write BDD directly in TypeScript with full
// type inference and IDE autocomplete.
//
// ```ts
// import { feature, scenario, given, when, then } from 'browsecraft';
//
// feature('Login', () => {
//   scenario('Valid credentials', ({ page }) => {
//     given('I am on the login page', () => page.goto('/login'));
//     when('I enter valid credentials', async () => {
//       await page.fill('Email', 'user@test.com');
//       await page.fill('Password', 'password123');
//       await page.click('Sign In');
//     });
//     then('I should see the dashboard', async () => {
//       await page.waitForText('Welcome');
//     });
//   });
// });
// ```
//
// This mode builds the same result structure as the Gherkin executor,
// so it works with the same hooks, reporters, and CI integrations.
//
// Built from scratch. No external BDD framework dependency.
// ============================================================================

import type {
	FeatureResult,
	RunResult,
	ScenarioResult,
	StepResult,
	StepStatus,
} from './executor.js';
import { computeSummary } from './executor.js';
import { type HookContext, type HookRegistry, globalHookRegistry } from './hooks.js';
import type { StepWorld } from './step-registry.js';
import { type TagExpression, evaluateTagExpression, parseTagExpression } from './tags.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Context passed to scenario callbacks */
export interface ScenarioContext {
	/** The current page (set by worldFactory) */
	page: unknown;
	/** The current browser (set by worldFactory) */
	browser: unknown;
	/** Shared state between steps within a scenario */
	ctx: Record<string, unknown>;
	/** Attach data for reporting */
	attach: (data: string | Buffer, mediaType?: string) => void;
	/** Log a message for reporting */
	log: (message: string) => void;
}

export interface TsBddOptions {
	/** Custom world factory — creates the ScenarioContext for each scenario */
	worldFactory?: () => ScenarioContext | Promise<ScenarioContext>;
	/** Hook registry to use. Defaults to globalHookRegistry. */
	hooks?: HookRegistry;
	/** Tag filter expression */
	tagFilter?: string;
	/** Default step timeout in ms. Default: 30000 */
	stepTimeout?: number;
	/** Whether to stop on first failure. Default: false */
	failFast?: boolean;
}

type StepFn = () => void | Promise<void>;

interface PendingStep {
	keyword: string;
	text: string;
	fn: StepFn;
}

interface PendingScenario {
	name: string;
	tags: string[];
	fn: (ctx: ScenarioContext) => void | Promise<void>;
}

interface PendingFeature {
	name: string;
	tags: string[];
	scenarios: PendingScenario[];
	befores: StepFn[];
	afters: StepFn[];
}

// ---------------------------------------------------------------------------
// Collector — gathers feature/scenario/step definitions
// ---------------------------------------------------------------------------

/** Global state for the current collection phase */
let currentFeature: PendingFeature | null = null;
let currentSteps: PendingStep[] | null = null;
let collectedFeatures: PendingFeature[] = [];

/**
 * Define a feature.
 *
 * ```ts
 * feature('User Registration', () => {
 *   scenario('New user signs up', ({ page }) => {
 *     given('I am on the registration page', () => page.goto('/register'));
 *     when('I fill in the form', async () => { ... });
 *     then('I should see a success message', async () => { ... });
 *   });
 * });
 * ```
 */
export function feature(name: string, fn: () => void): void;
export function feature(tags: string[], name: string, fn: () => void): void;
export function feature(
	nameOrTags: string | string[],
	fnOrName?: (() => void) | string,
	maybeFn?: () => void,
): void {
	let name: string;
	let tags: string[] = [];
	let fn: () => void;

	if (Array.isArray(nameOrTags)) {
		tags = nameOrTags;
		name = fnOrName as string;
		fn = maybeFn!;
	} else {
		name = nameOrTags;
		fn = fnOrName as () => void;
	}

	const prevFeature = currentFeature;
	currentFeature = { name, tags, scenarios: [], befores: [], afters: [] };

	// Execute the feature body to collect scenarios
	fn();

	collectedFeatures.push(currentFeature);
	currentFeature = prevFeature;
}

/**
 * Define a scenario within a feature.
 *
 * ```ts
 * scenario('Valid login', ({ page }) => {
 *   given('I am on the login page', () => page.goto('/login'));
 *   when('I click Sign In', () => page.click('Sign In'));
 *   then('I see the dashboard', () => page.waitForText('Dashboard'));
 * });
 * ```
 */
export function scenario(name: string, fn: (ctx: ScenarioContext) => void | Promise<void>): void;
export function scenario(
	tags: string[],
	name: string,
	fn: (ctx: ScenarioContext) => void | Promise<void>,
): void;
export function scenario(
	nameOrTags: string | string[],
	fnOrName?: ((ctx: ScenarioContext) => void | Promise<void>) | string,
	maybeFn?: (ctx: ScenarioContext) => void | Promise<void>,
): void {
	if (!currentFeature) {
		throw new Error('scenario() must be called inside a feature() block');
	}

	let name: string;
	let tags: string[] = [];
	let fn: (ctx: ScenarioContext) => void | Promise<void>;

	if (Array.isArray(nameOrTags)) {
		tags = nameOrTags;
		name = fnOrName as string;
		fn = maybeFn!;
	} else {
		name = nameOrTags;
		fn = fnOrName as (ctx: ScenarioContext) => void | Promise<void>;
	}

	currentFeature.scenarios.push({ name, tags, fn });
}

/**
 * Define a Given step within a scenario.
 */
export function given(text: string, fn: StepFn): void {
	if (!currentSteps) {
		throw new Error('given() must be called inside a scenario execution');
	}
	currentSteps.push({ keyword: 'Given', text, fn });
}

/**
 * Define a When step within a scenario.
 */
export function when(text: string, fn: StepFn): void {
	if (!currentSteps) {
		throw new Error('when() must be called inside a scenario execution');
	}
	currentSteps.push({ keyword: 'When', text, fn });
}

/**
 * Define a Then step within a scenario.
 */
export function then(text: string, fn: StepFn): void {
	if (!currentSteps) {
		throw new Error('then() must be called inside a scenario execution');
	}
	currentSteps.push({ keyword: 'Then', text, fn });
}

/**
 * Define an And step within a scenario.
 */
export function and(text: string, fn: StepFn): void {
	if (!currentSteps) {
		throw new Error('and() must be called inside a scenario execution');
	}
	currentSteps.push({ keyword: 'And', text, fn });
}

/**
 * Define a But step within a scenario.
 */
export function but(text: string, fn: StepFn): void {
	if (!currentSteps) {
		throw new Error('but() must be called inside a scenario execution');
	}
	currentSteps.push({ keyword: 'But', text, fn });
}

/**
 * Define a before hook within a feature (runs before each scenario).
 */
export function beforeEach(fn: StepFn): void {
	if (!currentFeature) {
		throw new Error('beforeEach() must be called inside a feature() block');
	}
	currentFeature.befores.push(fn);
}

/**
 * Define an after hook within a feature (runs after each scenario).
 */
export function afterEach(fn: StepFn): void {
	if (!currentFeature) {
		throw new Error('afterEach() must be called inside a feature() block');
	}
	currentFeature.afters.push(fn);
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/**
 * Execute all collected TypeScript-native BDD features.
 *
 * ```ts
 * // Define features
 * feature('Login', () => { ... });
 * feature('Registration', () => { ... });
 *
 * // Run them
 * const result = await runFeatures({
 *   worldFactory: () => ({ page: myPage, browser: myBrowser, ctx: {} }),
 * });
 * ```
 */
export async function runFeatures(options: TsBddOptions = {}): Promise<RunResult> {
	const hooks = options.hooks ?? globalHookRegistry;
	const stepTimeout = options.stepTimeout ?? 30000;
	const tagFilter = options.tagFilter ? parseTagExpression(options.tagFilter) : null;

	const runStart = Date.now();
	const featureResults: FeatureResult[] = [];

	// BeforeAll hooks
	await hooks.runHooks('beforeAll', {});

	try {
		for (const feat of collectedFeatures) {
			const featureResult = await runTsFeature(feat, {
				hooks,
				stepTimeout,
				tagFilter,
				worldFactory: options.worldFactory,
				failFast: options.failFast ?? false,
			});
			featureResults.push(featureResult);

			if (options.failFast && featureResult.status === 'failed') {
				break;
			}
		}
	} finally {
		// AfterAll hooks
		await hooks.runHooks('afterAll', {});
	}

	// Clear collected features after running
	collectedFeatures = [];

	const duration = Date.now() - runStart;
	return {
		features: featureResults,
		duration,
		summary: computeSummary(featureResults),
	};
}

/**
 * Clear all collected features (useful for test isolation).
 */
export function clearFeatures(): void {
	collectedFeatures = [];
}

/**
 * Get the number of collected features (useful for validation).
 */
export function getCollectedFeatureCount(): number {
	return collectedFeatures.length;
}

// ---------------------------------------------------------------------------
// Internal runner
// ---------------------------------------------------------------------------

interface InternalRunOptions {
	hooks: HookRegistry;
	stepTimeout: number;
	tagFilter: TagExpression | null;
	worldFactory?: () => ScenarioContext | Promise<ScenarioContext>;
	failFast: boolean;
}

async function runTsFeature(
	feat: PendingFeature,
	opts: InternalRunOptions,
): Promise<FeatureResult> {
	const featureStart = Date.now();
	const featureTags = feat.tags;
	const scenarioResults: ScenarioResult[] = [];

	// BeforeFeature hooks
	await opts.hooks.runHooks('beforeFeature', {
		featureName: feat.name,
		featureTags,
	});

	try {
		for (const sc of feat.scenarios) {
			const scenarioTags = [...featureTags, ...sc.tags];

			// Tag filtering
			if (opts.tagFilter && !evaluateTagExpression(opts.tagFilter, scenarioTags)) {
				scenarioResults.push({
					name: sc.name,
					status: 'skipped',
					steps: [],
					duration: 0,
					tags: scenarioTags,
					line: 0,
				});
				continue;
			}

			const result = await runTsScenario(sc, feat, scenarioTags, opts);
			scenarioResults.push(result);

			if (opts.failFast && result.status === 'failed') {
				break;
			}
		}
	} finally {
		// AfterFeature hooks
		await opts.hooks.runHooks('afterFeature', {
			featureName: feat.name,
			featureTags,
		});
	}

	const status = scenarioResults.some((s) => s.status === 'failed')
		? 'failed'
		: scenarioResults.every((s) => s.status === 'skipped')
			? 'skipped'
			: 'passed';

	return {
		name: feat.name,
		status,
		scenarios: scenarioResults,
		duration: Date.now() - featureStart,
		tags: featureTags,
	};
}

async function runTsScenario(
	sc: PendingScenario,
	feat: PendingFeature,
	tags: string[],
	opts: InternalRunOptions,
): Promise<ScenarioResult> {
	const scenarioStart = Date.now();
	let hookError: Error | undefined;

	// Create world/context
	const ctx: ScenarioContext = opts.worldFactory
		? await opts.worldFactory()
		: { page: null, browser: null, ctx: {}, attach: () => {}, log: () => {} };

	const hookContext: HookContext = {
		world: ctx as unknown as StepWorld,
		featureName: feat.name,
		scenarioName: sc.name,
		scenarioTags: tags,
	};

	// BeforeScenario hooks
	try {
		await opts.hooks.runHooks('beforeScenario', hookContext);
	} catch (err) {
		hookError = err instanceof Error ? err : new Error(String(err));
	}

	// Feature-level beforeEach
	if (!hookError) {
		for (const before of feat.befores) {
			try {
				await before();
			} catch (err) {
				hookError = err instanceof Error ? err : new Error(String(err));
				break;
			}
		}
	}

	// Collect steps by executing the scenario function (which calls given/when/then)
	const prevSteps = currentSteps;
	currentSteps = [];

	try {
		await sc.fn(ctx);
	} catch (err) {
		// If the scenario function itself throws (not a step), capture it
		if (!hookError) {
			hookError = err instanceof Error ? err : new Error(String(err));
		}
	}

	const steps = currentSteps;
	currentSteps = prevSteps;

	// Execute collected steps
	const stepResults: StepResult[] = [];
	let scenarioFailed = !!hookError;

	for (const step of steps) {
		if (scenarioFailed) {
			stepResults.push({
				text: step.text,
				keyword: step.keyword,
				status: 'skipped',
				duration: 0,
				line: 0,
				attachments: [],
				logs: [],
			});
			continue;
		}

		const stepResult = await runTsStep(step, opts.stepTimeout);
		stepResults.push(stepResult);

		if (stepResult.status === 'failed') {
			scenarioFailed = true;
		}
	}

	// Feature-level afterEach
	for (const after of feat.afters) {
		try {
			await after();
		} catch (err) {
			if (!hookError) {
				hookError = err instanceof Error ? err : new Error(String(err));
			}
		}
	}

	// Determine status
	let status: ScenarioResult['status'];
	if (stepResults.some((s) => s.status === 'failed') || hookError) {
		status = 'failed';
	} else if (stepResults.some((s) => s.status === 'pending')) {
		status = 'pending';
	} else if (stepResults.every((s) => s.status === 'skipped') && stepResults.length > 0) {
		status = 'skipped';
	} else {
		status = 'passed';
	}

	hookContext.result = status;

	// AfterScenario hooks
	try {
		await opts.hooks.runHooks('afterScenario', hookContext);
	} catch (err) {
		if (!hookError) {
			hookError = err instanceof Error ? err : new Error(String(err));
			status = 'failed';
		}
	}

	return {
		name: sc.name,
		status,
		steps: stepResults,
		duration: Date.now() - scenarioStart,
		tags,
		line: 0,
		hookError,
	};
}

async function runTsStep(step: PendingStep, timeout: number): Promise<StepResult> {
	const stepStart = Date.now();

	try {
		const result = step.fn();

		if (result instanceof Promise) {
			await Promise.race([
				result,
				new Promise<never>((_, reject) =>
					setTimeout(
						() =>
							reject(
								new Error(`Step timed out after ${timeout}ms: "${step.keyword} ${step.text}"`),
							),
						timeout,
					),
				),
			]);
		}

		return {
			text: step.text,
			keyword: step.keyword,
			status: 'passed',
			duration: Date.now() - stepStart,
			line: 0,
			attachments: [],
			logs: [],
		};
	} catch (err) {
		const error = err instanceof Error ? err : new Error(String(err));

		if (error.message === 'PENDING') {
			return {
				text: step.text,
				keyword: step.keyword,
				status: 'pending',
				duration: Date.now() - stepStart,
				line: 0,
				attachments: [],
				logs: [],
			};
		}

		return {
			text: step.text,
			keyword: step.keyword,
			status: 'failed',
			duration: Date.now() - stepStart,
			error,
			line: 0,
			attachments: [],
			logs: [],
		};
	}
}
