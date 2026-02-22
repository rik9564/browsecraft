// ============================================================================
// BDD Test Executor — runs parsed Gherkin documents against step definitions.
//
// Responsibilities:
// - Execute Feature → Scenario → Step lifecycle
// - Scenario Outline expansion (Examples tables)
// - Background step prepending
// - DataTable and DocString injection into step args
// - Hook invocation at every lifecycle point
// - Tag filtering (skip scenarios that don't match tag filter)
// - Error collection and reporting
// - Step status tracking (passed, failed, skipped, pending, undefined)
// - Timeout support per step
//
// Built from scratch. No Cucumber runtime dependency.
// ============================================================================

import type {
	Background,
	DocString,
	Examples,
	Feature,
	FeatureChild,
	DataTable as GherkinDataTable,
	GherkinDocument,
	Rule,
	RuleChild,
	Scenario,
	Step,
	Tag,
} from './gherkin-parser.js';

import {
	BrowsecraftDataTable,
	type StepMatch,
	type StepRegistry,
	type StepType,
	type StepWorld,
	escapeRegex,
	globalRegistry,
} from './step-registry.js';

import { type HookContext, type HookRegistry, globalHookRegistry } from './hooks.js';
import { type TagExpression, evaluateTagExpression, parseTagExpression } from './tags.js';

// ---------------------------------------------------------------------------
// Result Types
// ---------------------------------------------------------------------------

export type StepStatus = 'passed' | 'failed' | 'skipped' | 'pending' | 'undefined';

export interface StepResult {
	/** The step text */
	text: string;
	/** The keyword (Given, When, Then, And, But, *) */
	keyword: string;
	/** Execution status */
	status: StepStatus;
	/** Duration in milliseconds */
	duration: number;
	/** Error if the step failed */
	error?: Error;
	/** Line number in the .feature file */
	line: number;
	/** Attachments added via world.attach() */
	attachments: Attachment[];
	/** Log messages added via world.log() */
	logs: string[];
}

export interface Attachment {
	data: string | Buffer;
	mediaType: string;
}

export interface ScenarioResult {
	/** The scenario name */
	name: string;
	/** Overall status */
	status: 'passed' | 'failed' | 'skipped' | 'pending';
	/** Results for each step */
	steps: StepResult[];
	/** Total duration in milliseconds */
	duration: number;
	/** Tags on this scenario (including inherited) */
	tags: string[];
	/** Line number in the .feature file */
	line: number;
	/** If this is from a Scenario Outline, the example row index */
	exampleIndex?: number;
	/** If this is from a Scenario Outline, the example values */
	exampleValues?: Record<string, string>;
	/** Error from hooks */
	hookError?: Error;
}

export interface FeatureResult {
	/** The feature name */
	name: string;
	/** Overall status */
	status: 'passed' | 'failed' | 'skipped';
	/** Results for each scenario */
	scenarios: ScenarioResult[];
	/** Total duration in milliseconds */
	duration: number;
	/** Tags on this feature */
	tags: string[];
	/** Source file URI */
	uri?: string;
}

export interface RunResult {
	/** Results for each feature */
	features: FeatureResult[];
	/** Total duration in milliseconds */
	duration: number;
	/** Summary counts */
	summary: {
		features: { total: number; passed: number; failed: number; skipped: number };
		scenarios: { total: number; passed: number; failed: number; skipped: number; pending: number };
		steps: {
			total: number;
			passed: number;
			failed: number;
			skipped: number;
			pending: number;
			undefined: number;
		};
	};
}

// ---------------------------------------------------------------------------
// Executor Options
// ---------------------------------------------------------------------------

export interface ExecutorOptions {
	/** Step registry to use. Defaults to globalRegistry. */
	registry?: StepRegistry;
	/** Hook registry to use. Defaults to globalHookRegistry. */
	hooks?: HookRegistry;
	/** Tag filter expression. Only scenarios matching this expression will run. */
	tagFilter?: string;
	/** Default step timeout in milliseconds. Default: 30000 */
	stepTimeout?: number;
	/** Whether to stop on first failure. Default: false */
	failFast?: boolean;
	/** Whether to run steps after a failure in the same scenario. Default: false (skip remaining) */
	dryRun?: boolean;
	/** Slow down step execution by this many milliseconds between steps. Default: 0 */
	slowMo?: number;
	/** Custom world factory. Creates the StepWorld for each scenario. */
	worldFactory?: () => StepWorld | Promise<StepWorld>;
	/** Called when a step starts */
	onStepStart?: (step: Step, scenarioName: string) => void;
	/** Called when a step ends */
	onStepEnd?: (result: StepResult, scenarioName: string) => void;
	/** Called when a scenario starts */
	onScenarioStart?: (scenario: Scenario, featureName: string) => void;
	/** Called when a scenario ends */
	onScenarioEnd?: (result: ScenarioResult, featureName: string) => void;
	/** Called when a feature starts */
	onFeatureStart?: (feature: Feature) => void;
	/** Called when a feature ends */
	onFeatureEnd?: (result: FeatureResult) => void;
}

// ---------------------------------------------------------------------------
// Default world factory
// ---------------------------------------------------------------------------

function createDefaultWorld(): StepWorld {
	return {
		page: null,
		browser: null,
		ctx: {},
		attach: () => {},
		log: () => {},
	};
}

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

export class BddExecutor {
	private readonly registry: StepRegistry;
	private readonly hooks: HookRegistry;
	private readonly options: ExecutorOptions;
	private readonly tagFilter: TagExpression | null;

	constructor(options: ExecutorOptions = {}) {
		this.registry = options.registry ?? globalRegistry;
		this.hooks = options.hooks ?? globalHookRegistry;
		this.options = {
			stepTimeout: 30000,
			failFast: false,
			dryRun: false,
			...options,
		};
		this.tagFilter = options.tagFilter ? parseTagExpression(options.tagFilter) : null;
	}

	/**
	 * Execute one or more parsed Gherkin documents.
	 */
	async run(documents: GherkinDocument[]): Promise<RunResult> {
		const runStart = Date.now();
		const featureResults: FeatureResult[] = [];

		// BeforeAll hooks
		await this.hooks.runHooks('beforeAll', {});

		try {
			for (const doc of documents) {
				if (!doc.feature) continue;

				const featureResult = await this.executeFeature(doc.feature, doc.uri);
				featureResults.push(featureResult);

				if (this.options.failFast && featureResult.status === 'failed') {
					break;
				}
			}
		} finally {
			// AfterAll hooks (always run)
			await this.hooks.runHooks('afterAll', {});
		}

		const duration = Date.now() - runStart;
		return {
			features: featureResults,
			duration,
			summary: computeSummary(featureResults),
		};
	}

	/**
	 * Execute a single parsed Gherkin document.
	 */
	async runDocument(document: GherkinDocument): Promise<RunResult> {
		return this.run([document]);
	}

	// -----------------------------------------------------------------------
	// Feature execution
	// -----------------------------------------------------------------------

	private async executeFeature(feature: Feature, uri?: string): Promise<FeatureResult> {
		const featureStart = Date.now();
		const featureTags = feature.tags.map((t) => t.name);
		const scenarioResults: ScenarioResult[] = [];

		this.options.onFeatureStart?.(feature);

		// BeforeFeature hooks
		await this.hooks.runHooks('beforeFeature', {
			featureName: feature.name,
			featureTags,
		});

		try {
			// Collect background steps at the feature level
			const featureBackground = this.findBackground(feature.children);

			for (const child of feature.children) {
				if ('scenario' in child) {
					const results = await this.executeScenarioOrOutline(
						child.scenario,
						featureTags,
						featureBackground,
						feature.name,
					);
					scenarioResults.push(...results);

					if (this.options.failFast && results.some((r) => r.status === 'failed')) {
						break;
					}
				} else if ('rule' in child) {
					const ruleResults = await this.executeRule(
						child.rule,
						featureTags,
						featureBackground,
						feature.name,
					);
					scenarioResults.push(...ruleResults);

					if (this.options.failFast && ruleResults.some((r) => r.status === 'failed')) {
						break;
					}
				}
				// 'background' at feature level is captured above — skip
			}
		} finally {
			// AfterFeature hooks
			await this.hooks.runHooks('afterFeature', {
				featureName: feature.name,
				featureTags,
			});
		}

		const status = scenarioResults.some((s) => s.status === 'failed')
			? 'failed'
			: scenarioResults.every((s) => s.status === 'skipped')
				? 'skipped'
				: 'passed';

		const result: FeatureResult = {
			name: feature.name,
			status,
			scenarios: scenarioResults,
			duration: Date.now() - featureStart,
			tags: featureTags,
			uri,
		};

		this.options.onFeatureEnd?.(result);
		return result;
	}

	// -----------------------------------------------------------------------
	// Rule execution
	// -----------------------------------------------------------------------

	private async executeRule(
		rule: Rule,
		featureTags: string[],
		featureBackground: Background | null,
		featureName: string,
	): Promise<ScenarioResult[]> {
		const ruleTags = [...featureTags, ...rule.tags.map((t) => t.name)];
		const ruleBackground = this.findBackground(rule.children) ?? featureBackground;
		const results: ScenarioResult[] = [];

		for (const child of rule.children) {
			if ('scenario' in child) {
				const scenarioResults = await this.executeScenarioOrOutline(
					child.scenario,
					ruleTags,
					ruleBackground,
					featureName,
				);
				results.push(...scenarioResults);

				if (this.options.failFast && scenarioResults.some((r) => r.status === 'failed')) {
					break;
				}
			}
		}

		return results;
	}

	// -----------------------------------------------------------------------
	// Scenario / Scenario Outline execution
	// -----------------------------------------------------------------------

	private async executeScenarioOrOutline(
		scenario: Scenario,
		parentTags: string[],
		background: Background | null,
		featureName: string,
	): Promise<ScenarioResult[]> {
		const scenarioTags = [...parentTags, ...scenario.tags.map((t) => t.name)];

		// Check tag filter
		if (this.tagFilter && !evaluateTagExpression(this.tagFilter, scenarioTags)) {
			return [
				{
					name: scenario.name,
					status: 'skipped',
					steps: [],
					duration: 0,
					tags: scenarioTags,
					line: scenario.line,
				},
			];
		}

		// Scenario Outline — expand Examples
		if (scenario.examples.length > 0) {
			return this.executeScenarioOutline(scenario, scenarioTags, background, featureName);
		}

		// Regular Scenario
		const result = await this.executeSingleScenario(
			scenario,
			scenarioTags,
			background,
			featureName,
		);
		return [result];
	}

	private async executeScenarioOutline(
		scenario: Scenario,
		scenarioTags: string[],
		background: Background | null,
		featureName: string,
	): Promise<ScenarioResult[]> {
		const results: ScenarioResult[] = [];

		for (const examples of scenario.examples) {
			// Examples-level tags
			const examplesTags = [...scenarioTags, ...examples.tags.map((t) => t.name)];

			// Check tag filter for examples-level tags
			if (this.tagFilter && !evaluateTagExpression(this.tagFilter, examplesTags)) {
				continue;
			}

			if (!examples.tableHeader) continue;

			const headers = examples.tableHeader.cells.map((c) => c.value);

			for (let rowIdx = 0; rowIdx < examples.tableBody.length; rowIdx++) {
				const row = examples.tableBody[rowIdx]!;
				const values: Record<string, string> = {};
				for (let colIdx = 0; colIdx < headers.length; colIdx++) {
					const header = headers[colIdx]!;
					values[header] = row.cells[colIdx]?.value ?? '';
				}

				// Expand <placeholder> in step texts
				const expandedSteps = scenario.steps.map((step) => this.expandOutlineStep(step, values));

				// Create a virtual scenario with expanded steps
				const expandedScenario: Scenario = {
					...scenario,
					name: this.expandPlaceholders(scenario.name, values),
					steps: expandedSteps,
					examples: [], // Already expanded
				};

				const result = await this.executeSingleScenario(
					expandedScenario,
					examplesTags,
					background,
					featureName,
				);
				result.exampleIndex = rowIdx;
				result.exampleValues = values;
				results.push(result);

				if (this.options.failFast && result.status === 'failed') {
					return results;
				}
			}
		}

		return results;
	}

	private async executeSingleScenario(
		scenario: Scenario,
		tags: string[],
		background: Background | null,
		featureName: string,
	): Promise<ScenarioResult> {
		const scenarioStart = Date.now();
		const stepResults: StepResult[] = [];
		let scenarioFailed = false;
		let hookError: Error | undefined;

		this.options.onScenarioStart?.(scenario, featureName);

		// Create world for this scenario
		const world = this.options.worldFactory
			? await this.options.worldFactory()
			: createDefaultWorld();

		const hookContext: HookContext = {
			world,
			featureName,
			scenarioName: scenario.name,
			scenarioTags: tags,
		};

		try {
			// BeforeScenario hooks
			await this.hooks.runHooks('beforeScenario', hookContext);
		} catch (err) {
			hookError = err instanceof Error ? err : new Error(String(err));
			scenarioFailed = true;
		}

		// Collect all steps: background first, then scenario steps
		const allSteps: Step[] = [];
		if (background && !scenarioFailed) {
			allSteps.push(...background.steps);
		}
		allSteps.push(...scenario.steps);

		// Track the effective keyword type for And/But steps
		let lastKeywordType: StepType = 'Any';

		for (const step of allSteps) {
			if (scenarioFailed && !this.options.dryRun) {
				// Skip remaining steps after a failure
				stepResults.push({
					text: step.text,
					keyword: step.keyword,
					status: 'skipped',
					duration: 0,
					line: step.line,
					attachments: [],
					logs: [],
				});
				continue;
			}

			const result = await this.executeStep(step, world, tags, lastKeywordType);
			stepResults.push(result);

			// Slow-mo delay between steps (for headed/visual debugging)
			if (this.options.slowMo && this.options.slowMo > 0 && result.status === 'passed') {
				await new Promise((r) => setTimeout(r, this.options.slowMo));
			}

			// Update effective keyword type
			if (step.keywordType === 'Context') lastKeywordType = 'Given';
			else if (step.keywordType === 'Action') lastKeywordType = 'When';
			else if (step.keywordType === 'Outcome') lastKeywordType = 'Then';
			// Conjunction and Unknown inherit from previous

			if (result.status === 'failed' || result.status === 'undefined') {
				scenarioFailed = true;
			}
		}

		// Determine overall scenario status
		let status: ScenarioResult['status'];
		if (stepResults.some((s) => s.status === 'failed') || hookError) {
			status = 'failed';
		} else if (stepResults.some((s) => s.status === 'undefined' || s.status === 'pending')) {
			status = 'pending';
		} else if (stepResults.every((s) => s.status === 'skipped')) {
			status = 'skipped';
		} else {
			status = 'passed';
		}

		hookContext.result = status;

		try {
			// AfterScenario hooks (always run)
			await this.hooks.runHooks('afterScenario', hookContext);
		} catch (err) {
			if (!hookError) {
				hookError = err instanceof Error ? err : new Error(String(err));
				status = 'failed';
			}
		}

		const result: ScenarioResult = {
			name: scenario.name,
			status,
			steps: stepResults,
			duration: Date.now() - scenarioStart,
			tags,
			line: scenario.line,
			hookError,
		};

		this.options.onScenarioEnd?.(result, featureName);
		return result;
	}

	// -----------------------------------------------------------------------
	// Step execution
	// -----------------------------------------------------------------------

	private async executeStep(
		step: Step,
		world: StepWorld,
		scenarioTags: string[],
		lastKeywordType: StepType,
	): Promise<StepResult> {
		const stepStart = Date.now();
		const attachments: Attachment[] = [];
		const logs: string[] = [];

		// Inject attach/log into world for this step
		world.attach = (data: string | Buffer, mediaType = 'text/plain') => {
			attachments.push({ data, mediaType });
		};
		world.log = (message: string) => {
			logs.push(message);
		};

		// Determine the effective step type for matching
		let matchType: StepType;
		switch (step.keywordType) {
			case 'Context':
				matchType = 'Given';
				break;
			case 'Action':
				matchType = 'When';
				break;
			case 'Outcome':
				matchType = 'Then';
				break;
			case 'Conjunction':
			case 'Unknown':
				matchType = lastKeywordType;
				break;
			default:
				matchType = 'Any';
		}

		// Fire BeforeStep hook
		const hookContext: HookContext = {
			world,
			scenarioTags,
			stepText: step.text,
			stepKeyword: step.keyword,
		};

		this.options.onStepStart?.(step, '');

		try {
			await this.hooks.runHooks('beforeStep', hookContext);
		} catch (err) {
			const result: StepResult = {
				text: step.text,
				keyword: step.keyword,
				status: 'failed',
				duration: Date.now() - stepStart,
				error: err instanceof Error ? err : new Error(String(err)),
				line: step.line,
				attachments,
				logs,
			};
			this.options.onStepEnd?.(result, '');
			return result;
		}

		// Match the step
		const match = this.registry.match(step.text, matchType, scenarioTags);

		if (!match) {
			// Undefined step
			const result: StepResult = {
				text: step.text,
				keyword: step.keyword,
				status: 'undefined',
				duration: Date.now() - stepStart,
				error: new Error(
					`Undefined step: "${step.keyword} ${step.text}"\n${this.formatSuggestions(step.text)}`,
				),
				line: step.line,
				attachments,
				logs,
			};

			// Fire AfterStep hook
			hookContext.error = result.error;
			try {
				await this.hooks.runHooks('afterStep', hookContext);
			} catch {
				/* ignore */
			}

			this.options.onStepEnd?.(result, '');
			return result;
		}

		// Build args: matched params + optional DataTable + optional DocString
		const args: unknown[] = [...match.args];

		if (step.dataTable) {
			args.push(new BrowsecraftDataTable(step.dataTable));
		}
		if (step.docString) {
			args.push(step.docString.content);
		}

		// Execute the step function with timeout
		try {
			const stepPromise = match.definition.fn(world, ...args);

			if (stepPromise instanceof Promise) {
				await Promise.race([
					stepPromise,
					new Promise<never>((_, reject) =>
						setTimeout(
							() =>
								reject(
									new Error(
										`Step timed out after ${this.options.stepTimeout}ms: "${step.keyword} ${step.text}"`,
									),
								),
							this.options.stepTimeout,
						),
					),
				]);
			}

			const result: StepResult = {
				text: step.text,
				keyword: step.keyword,
				status: 'passed',
				duration: Date.now() - stepStart,
				line: step.line,
				attachments,
				logs,
			};

			// Fire AfterStep hook
			try {
				await this.hooks.runHooks('afterStep', hookContext);
			} catch {
				/* ignore */
			}

			this.options.onStepEnd?.(result, '');
			return result;
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));

			// Check for pending marker
			if (error.message === 'PENDING') {
				const result: StepResult = {
					text: step.text,
					keyword: step.keyword,
					status: 'pending',
					duration: Date.now() - stepStart,
					line: step.line,
					attachments,
					logs,
				};

				hookContext.error = error;
				try {
					await this.hooks.runHooks('afterStep', hookContext);
				} catch {
					/* ignore */
				}

				this.options.onStepEnd?.(result, '');
				return result;
			}

			const result: StepResult = {
				text: step.text,
				keyword: step.keyword,
				status: 'failed',
				duration: Date.now() - stepStart,
				error,
				line: step.line,
				attachments,
				logs,
			};

			hookContext.error = error;
			try {
				await this.hooks.runHooks('afterStep', hookContext);
			} catch {
				/* ignore */
			}

			this.options.onStepEnd?.(result, '');
			return result;
		}
	}

	// -----------------------------------------------------------------------
	// Helpers
	// -----------------------------------------------------------------------

	private findBackground(children: (FeatureChild | RuleChild)[]): Background | null {
		for (const child of children) {
			if ('background' in child) {
				return child.background;
			}
		}
		return null;
	}

	private expandOutlineStep(step: Step, values: Record<string, string>): Step {
		return {
			...step,
			text: this.expandPlaceholders(step.text, values),
			dataTable: step.dataTable ? this.expandDataTable(step.dataTable, values) : null,
			docString: step.docString ? this.expandDocString(step.docString, values) : null,
		};
	}

	private expandPlaceholders(text: string, values: Record<string, string>): string {
		let result = text;
		for (const [key, value] of Object.entries(values)) {
			result = result.replace(new RegExp(`<${escapeRegex(key)}>`, 'g'), value);
		}
		return result;
	}

	private expandDataTable(
		table: GherkinDataTable,
		values: Record<string, string>,
	): GherkinDataTable {
		return {
			rows: table.rows.map((row) => ({
				...row,
				cells: row.cells.map((cell) => ({
					value: this.expandPlaceholders(cell.value, values),
				})),
			})),
		};
	}

	private expandDocString(docString: DocString, values: Record<string, string>): DocString {
		return {
			...docString,
			content: this.expandPlaceholders(docString.content, values),
		};
	}

	private formatSuggestions(text: string): string {
		const suggestions = this.registry.suggest(text, 3);
		if (suggestions.length === 0) return '';

		const lines = suggestions.map((s) => `  - ${s.pattern}`);
		return `\nDid you mean:\n${lines.join('\n')}`;
	}
}

// ---------------------------------------------------------------------------
// Summary computation (shared with ts-bdd.ts)
// ---------------------------------------------------------------------------

/** Compute a summary of feature/scenario/step pass/fail counts. */
export function computeSummary(features: FeatureResult[]): RunResult['summary'] {
	const summary = {
		features: { total: 0, passed: 0, failed: 0, skipped: 0 },
		scenarios: { total: 0, passed: 0, failed: 0, skipped: 0, pending: 0 },
		steps: { total: 0, passed: 0, failed: 0, skipped: 0, pending: 0, undefined: 0 },
	};

	for (const f of features) {
		summary.features.total++;
		if (f.status === 'passed') summary.features.passed++;
		else if (f.status === 'failed') summary.features.failed++;
		else summary.features.skipped++;

		for (const s of f.scenarios) {
			summary.scenarios.total++;
			if (s.status === 'passed') summary.scenarios.passed++;
			else if (s.status === 'failed') summary.scenarios.failed++;
			else if (s.status === 'skipped') summary.scenarios.skipped++;
			else summary.scenarios.pending++;

			for (const st of s.steps) {
				summary.steps.total++;
				switch (st.status) {
					case 'passed':
						summary.steps.passed++;
						break;
					case 'failed':
						summary.steps.failed++;
						break;
					case 'skipped':
						summary.steps.skipped++;
						break;
					case 'pending':
						summary.steps.pending++;
						break;
					case 'undefined':
						summary.steps.undefined++;
						break;
				}
			}
		}
	}

	return summary;
}

// ---------------------------------------------------------------------------
// Convenience function
// ---------------------------------------------------------------------------

/**
 * Create and configure a BDD executor.
 *
 * ```ts
 * const executor = createExecutor({
 *   tagFilter: '@smoke and not @slow',
 *   stepTimeout: 10000,
 * });
 *
 * const doc = parseGherkin(featureSource);
 * const result = await executor.runDocument(doc);
 * ```
 */
export function createExecutor(options?: ExecutorOptions): BddExecutor {
	return new BddExecutor(options);
}

/**
 * Mark a step as pending (not yet implemented).
 * Throw this in a step definition to mark it as pending.
 *
 * ```ts
 * Given('something not implemented yet', () => {
 *   pending();
 * });
 * ```
 */
export function pending(): never {
	throw new Error('PENDING');
}
