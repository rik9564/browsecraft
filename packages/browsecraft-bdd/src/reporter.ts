// ============================================================================
// Studio Reporter — emits structured JSON events to stdout.
//
// When the CLI is invoked with `--reporter studio`, the executor callbacks
// are wired to this reporter. Each event is written to stdout as a single
// JSON line prefixed with a magic marker so Studio's main process can
// separate structured events from normal ANSI text output.
//
// The marker `[STUDIO_EVENT]` is chosen to be unique enough that it won't
// appear in normal test output.
// ============================================================================

import type { FeatureResult, RunResult, ScenarioResult, StepResult } from './executor.js';
import type { Feature, Scenario, Step } from './gherkin-parser.js';

// ---------------------------------------------------------------------------
// Event Types
// ---------------------------------------------------------------------------

export interface StudioFeatureStartEvent {
	type: 'feature-start';
	feature: string;
	uri?: string;
	tags: string[];
	timestamp: number;
}

export interface StudioFeatureEndEvent {
	type: 'feature-end';
	feature: string;
	status: string;
	duration: number;
	timestamp: number;
}

export interface StudioScenarioStartEvent {
	type: 'scenario-start';
	scenario: string;
	feature: string;
	tags: string[];
	line: number;
	timestamp: number;
}

export interface StudioScenarioEndEvent {
	type: 'scenario-end';
	scenario: string;
	feature: string;
	status: string;
	duration: number;
	timestamp: number;
}

export interface StudioStepStartEvent {
	type: 'step-start';
	keyword: string;
	text: string;
	scenario: string;
	line: number;
	timestamp: number;
}

export interface StudioStepEndEvent {
	type: 'step-end';
	keyword: string;
	text: string;
	status: string;
	duration: number;
	error?: string;
	scenario: string;
	line: number;
	timestamp: number;
}

export interface StudioRunEndEvent {
	type: 'run-end';
	duration: number;
	summary: RunResult['summary'];
	timestamp: number;
}

export type StudioEvent =
	| StudioFeatureStartEvent
	| StudioFeatureEndEvent
	| StudioScenarioStartEvent
	| StudioScenarioEndEvent
	| StudioStepStartEvent
	| StudioStepEndEvent
	| StudioRunEndEvent;

// ---------------------------------------------------------------------------
// Magic marker — Studio's main process scans stdout for lines starting with
// this prefix to extract structured events.
// ---------------------------------------------------------------------------

export const STUDIO_EVENT_MARKER = '[STUDIO_EVENT]';

// ---------------------------------------------------------------------------
// Reporter
// ---------------------------------------------------------------------------

/**
 * StudioReporter generates executor callback functions that emit JSON
 * events to stdout. The CLI wires these into the executor's `onFeatureStart`,
 * `onStepEnd`, etc. options.
 *
 * Usage:
 * ```ts
 * const reporter = new StudioReporter();
 * const executor = new BddExecutor({
 *   ...reporter.callbacks(),
 * });
 * const result = await executor.run(documents);
 * reporter.onRunEnd(result);
 * ```
 */
export class StudioReporter {
	/** Current feature name — tracked to pass to step/scenario events. */
	private currentFeature = '';

	/** Current scenario name — tracked to pass to step events. */
	private currentScenario = '';

	/** Write a JSON event to stdout with the magic marker prefix. */
	private emit(event: StudioEvent): void {
		const line = `${STUDIO_EVENT_MARKER}${JSON.stringify(event)}`;
		process.stdout.write(`${line}\n`);
	}

	/**
	 * Returns an object of executor callback functions that can be spread
	 * into `ExecutorOptions`.
	 */
	callbacks(): {
		onFeatureStart: (feature: Feature) => void;
		onFeatureEnd: (result: FeatureResult) => void;
		onScenarioStart: (scenario: Scenario, featureName: string) => void;
		onScenarioEnd: (result: ScenarioResult, featureName: string) => void;
		onStepStart: (step: Step, scenarioName: string) => void;
		onStepEnd: (result: StepResult, scenarioName: string) => void;
	} {
		return {
			onFeatureStart: (feature: Feature) => {
				this.currentFeature = feature.name;
				this.emit({
					type: 'feature-start',
					feature: feature.name,
					tags: feature.tags.map((t) => t.name),
					timestamp: Date.now(),
				});
			},
			onFeatureEnd: (result: FeatureResult) => {
				this.emit({
					type: 'feature-end',
					feature: result.name,
					status: result.status,
					duration: result.duration,
					timestamp: Date.now(),
				});
				if (result.uri) {
					// Retroactively set URI on feature-start (stored in the event)
					// Not needed — URI is on the result, not the callback
				}
			},
			onScenarioStart: (scenario: Scenario, featureName: string) => {
				this.currentFeature = featureName;
				this.currentScenario = scenario.name;
				this.emit({
					type: 'scenario-start',
					scenario: scenario.name,
					feature: featureName,
					tags: scenario.tags.map((t) => t.name),
					line: scenario.line,
					timestamp: Date.now(),
				});
			},
			onScenarioEnd: (result: ScenarioResult, featureName: string) => {
				this.emit({
					type: 'scenario-end',
					scenario: result.name,
					feature: featureName,
					status: result.status,
					duration: result.duration,
					timestamp: Date.now(),
				});
			},
			onStepStart: (step: Step, _scenarioName: string) => {
				// Note: the executor passes empty string for scenarioName (known bug).
				// We use our tracked currentScenario instead.
				this.emit({
					type: 'step-start',
					keyword: step.keyword.trim(),
					text: step.text,
					scenario: this.currentScenario,
					line: step.line,
					timestamp: Date.now(),
				});
			},
			onStepEnd: (result: StepResult, _scenarioName: string) => {
				this.emit({
					type: 'step-end',
					keyword: result.keyword.trim(),
					text: result.text,
					status: result.status,
					duration: result.duration,
					error: result.error?.message,
					scenario: this.currentScenario,
					line: result.line,
					timestamp: Date.now(),
				});
			},
		};
	}

	/**
	 * Emit a run-end event with summary counts.
	 * Call this after `executor.run()` completes.
	 */
	onRunEnd(result: RunResult): void {
		this.emit({
			type: 'run-end',
			duration: result.duration,
			summary: result.summary,
			timestamp: Date.now(),
		});
	}
}
