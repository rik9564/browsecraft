// ============================================================================
// Browsecraft - Trace Recorder
// Records a step-by-step timeline of a test (action, target, screenshot) so
// failures can be replayed and inspected after the fact.
//
// View a saved trace with: `browsecraft show-trace <path>`
// ============================================================================

/** Pixel bounding box of the acted-upon element, in the screenshot's coordinate space */
export interface TraceBoundingBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** A single recorded step in a trace */
export interface TraceStep {
	/** Zero-based order in which the step occurred */
	index: number;
	/** When the step was recorded (ms since epoch) */
	timestamp: number;
	/** The action name, e.g. 'click', 'fill', 'see' */
	action: string;
	/** Human-readable description of the target element */
	target: string;
	/** Base64-encoded PNG screenshot at the time of the step, if captured */
	screenshot?: string;
	/** Bounding box of the target element within the screenshot, if resolvable */
	boundingBox?: TraceBoundingBox;
	/** Page URL at the time of the step, if resolvable */
	url?: string;
	/**
	 * Full HTML snapshot of the page at the time of the step (a `<base>` tag
	 * is injected so relative resources resolve against the original page).
	 * Lets the viewer render a real, hoverable/inspectable DOM instead of a
	 * flat image. External resources (images/fonts/CSS) are not bundled, so
	 * they only load if the original site is still reachable when viewing.
	 */
	domSnapshot?: string;
}

/** Metadata saved alongside the recorded steps */
export interface TraceFile {
	title: string;
	suitePath: string[];
	status: 'passed' | 'failed' | 'skipped';
	steps: TraceStep[];
}

/**
 * Records a sequence of TraceSteps for a single test run.
 * Has no dependency on a real browser or BiDi session -- the caller supplies
 * a screenshot-taking function, which makes this fully unit-testable.
 */
export class TraceRecorder {
	private steps: TraceStep[] = [];

	constructor(private readonly captureScreenshots: boolean) {}

	/**
	 * Record one step. If screenshot capture is enabled, `takeScreenshot` is
	 * called and its result stored as base64 -- failures to screenshot are
	 * swallowed so tracing never breaks the test itself.
	 */
	async record(
		action: string,
		target: string,
		takeScreenshot: () => Promise<Buffer>,
		boundingBox?: TraceBoundingBox,
		url?: string,
		takeDomSnapshot?: () => Promise<string>,
	): Promise<void> {
		const step: TraceStep = {
			index: this.steps.length,
			timestamp: Date.now(),
			action,
			target,
			boundingBox,
			url,
		};

		if (this.captureScreenshots) {
			try {
				step.screenshot = (await takeScreenshot()).toString('base64');
			} catch {
				// Best-effort -- a failed screenshot must not fail the action.
			}
			if (takeDomSnapshot) {
				try {
					step.domSnapshot = await takeDomSnapshot();
				} catch {
					// Best-effort -- a failed DOM capture must not fail the action.
				}
			}
		}

		this.steps.push(step);
	}

	/** All steps recorded so far */
	getSteps(): TraceStep[] {
		return this.steps;
	}

	/** Serialize the trace to JSON, ready to write to disk */
	toJSON(meta: { title: string; suitePath: string[]; status: TraceFile['status'] }): string {
		const file: TraceFile = { ...meta, steps: this.steps };
		return JSON.stringify(file, null, 2);
	}
}
