// ============================================================================
// Browsecraft - Rich Error System
// When something fails, tell the user WHY and WHAT TO DO about it.
//
// Instead of: "Timed out after 30000ms"
// We say:     "Could not click 'Submit' — found the element but it was disabled.
//              Hint: wait for the form to finish loading, or check if the button
//              is conditionally enabled."
// ============================================================================

/** Element state snapshot at the time of failure */
export interface ElementState {
	/** Whether the element was found in the DOM */
	found: boolean;
	/** Whether the element is visible (display, visibility, opacity, size) */
	visible?: boolean;
	/** Whether the element is enabled (not disabled) */
	enabled?: boolean;
	/** Tag name (e.g., 'BUTTON', 'INPUT') */
	tagName?: string;
	/** Text content preview */
	textPreview?: string;
	/** Bounding box */
	boundingBox?: { x: number; y: number; width: number; height: number };
	/** Whether the element is obscured by another element */
	obscured?: boolean;
	/** The element that is obscuring this one */
	obscuredBy?: string;
	/** Classes on the element */
	classes?: string;
	/** id attribute */
	id?: string;
}

/**
 * Base error class for all Browsecraft errors.
 * Rich context helps users diagnose issues immediately.
 */
export class BrowsecraftError extends Error {
	override readonly name: string = 'BrowsecraftError';

	/** What action was being performed */
	readonly action: string;
	/** What target was being acted on */
	readonly target: string;
	/** Element state at the time of failure */
	readonly elementState?: ElementState;
	/** Hint for how to fix the issue */
	readonly hint?: string;
	/** How long we waited before giving up (ms) */
	readonly elapsed?: number;

	constructor(options: {
		action: string;
		target: string;
		message: string;
		elementState?: ElementState;
		hint?: string;
		elapsed?: number;
		cause?: Error;
	}) {
		const parts: string[] = [];
		parts.push(`Could not ${options.action} '${options.target}'`);
		parts.push(`— ${options.message}`);

		if (options.elementState) {
			parts.push('');
			parts.push(formatElementState(options.elementState));
		}

		if (options.hint) {
			parts.push('');
			parts.push(`Hint: ${options.hint}`);
		}

		if (options.elapsed !== undefined) {
			parts.push(`(waited ${options.elapsed}ms)`);
		}

		super(parts.join('\n'));
		this.action = options.action;
		this.target = options.target;
		this.elementState = options.elementState;
		this.hint = options.hint;
		this.elapsed = options.elapsed;
		if (options.cause) {
			this.cause = options.cause;
		}
	}
}

/**
 * Error thrown when an element cannot be found.
 */
export class ElementNotFoundError extends BrowsecraftError {
	override readonly name = 'ElementNotFoundError';

	constructor(options: {
		action: string;
		target: string;
		elapsed?: number;
		suggestions?: string[];
	}) {
		const hint = options.suggestions?.length
			? `Did you mean one of these?\n${options.suggestions.map((s) => `  - ${s}`).join('\n')}`
			: 'Check that the element exists on the page and the text/selector is correct.';

		super({
			action: options.action,
			target: options.target,
			message: 'no matching element found on the page.',
			elementState: { found: false },
			hint,
			elapsed: options.elapsed,
		});
	}
}

/**
 * Error thrown when an element is found but not actionable.
 */
export class ElementNotActionableError extends BrowsecraftError {
	override readonly name = 'ElementNotActionableError';
	readonly reason: 'not-visible' | 'disabled' | 'obscured' | 'zero-size' | 'detached';

	constructor(options: {
		action: string;
		target: string;
		reason: 'not-visible' | 'disabled' | 'obscured' | 'zero-size' | 'detached';
		elementState: ElementState;
		elapsed?: number;
	}) {
		const messages: Record<string, string> = {
			'not-visible':
				'the element was found but is not visible (display:none, visibility:hidden, opacity:0, or zero size).',
			disabled: 'the element was found but is disabled.',
			obscured: `the element was found but is obscured by another element${options.elementState.obscuredBy ? ` (${options.elementState.obscuredBy})` : ''}.`,
			'zero-size': 'the element was found but has zero width/height.',
			detached: 'the element was found but is no longer attached to the DOM.',
		};

		const hints: Record<string, string> = {
			'not-visible': 'Wait for a loading state to complete, or check CSS visibility rules.',
			disabled:
				'Wait for the element to become enabled, or check if a prerequisite action is needed first.',
			obscured:
				'Scroll the page, close overlapping modals/tooltips, or use { force: true } to bypass.',
			'zero-size': 'Check if the element has proper dimensions. It may be collapsed or off-screen.',
			detached:
				'The element was removed from the DOM while waiting. This often happens with dynamic content.',
		};

		super({
			action: options.action,
			target: options.target,
			message: messages[options.reason] ?? `the element is not actionable (${options.reason}).`,
			elementState: options.elementState,
			hint: hints[options.reason],
			elapsed: options.elapsed,
		});

		this.reason = options.reason;
	}
}

/**
 * Error thrown when a network operation fails.
 */
export class NetworkError extends BrowsecraftError {
	override readonly name = 'NetworkError';

	constructor(options: { action: string; target: string; message: string; elapsed?: number }) {
		super({
			action: options.action,
			target: options.target,
			message: options.message,
			hint: 'Check that the URL pattern is correct and network interception is set up before navigation.',
			elapsed: options.elapsed,
		});
	}
}

/**
 * Error thrown when a timeout occurs.
 */
export class TimeoutError extends BrowsecraftError {
	override readonly name = 'TimeoutError';
}

// ---------------------------------------------------------------------------
// Failure Classification — algorithmic, zero-AI, zero-config
// ---------------------------------------------------------------------------

/**
 * Categories of failures. Used by smart retry to decide whether retrying
 * the same action is worthwhile.
 */
export type FailureCategory =
	| 'element'
	| 'actionability'
	| 'timeout'
	| 'network'
	| 'assertion'
	| 'script'
	| 'unknown';

export interface FailureClassification {
	/** High-level category */
	category: FailureCategory;
	/** Whether retrying this failure is likely to succeed */
	retryable: boolean;
	/** Human-readable one-liner */
	description: string;
}

/**
 * Classify an error into a category and decide if it's retryable.
 *
 * This is pure algorithmic pattern matching — no AI, no config.
 * The runner uses this to skip retries for deterministic failures
 * (e.g., assertion errors) and only retry intermittent ones.
 */
export function classifyFailure(error: unknown): FailureClassification {
	if (!(error instanceof Error)) {
		return { category: 'unknown', retryable: true, description: 'Non-Error thrown' };
	}

	// Browsecraft typed errors — most specific first
	if (error instanceof ElementNotFoundError) {
		return {
			category: 'element',
			retryable: true,
			description: 'Element not found — page may still be loading or selector changed',
		};
	}

	if (error instanceof ElementNotActionableError) {
		return {
			category: 'actionability',
			retryable: true,
			description: `Element not actionable (${error.reason}) — may become ready`,
		};
	}

	if (error instanceof NetworkError) {
		return {
			category: 'network',
			retryable: true,
			description: 'Network failure — may be transient',
		};
	}

	if (error instanceof TimeoutError) {
		return {
			category: 'timeout',
			retryable: true,
			description: 'Timed out — environment may be slow or element delayed',
		};
	}

	// Node built-in assertion errors — NEVER retry (test logic is wrong)
	const name = error.name ?? '';
	if (
		name === 'AssertionError' ||
		name === 'AssertionError [ERR_ASSERTION]' ||
		name === 'ERR_ASSERTION' ||
		error.constructor?.name === 'AssertionError'
	) {
		return {
			category: 'assertion',
			retryable: false,
			description: "Assertion failed — retrying won't help",
		};
	}

	// Pattern match on message for common non-retryable errors
	const msg = error.message ?? '';
	const lowerMsg = msg.toLowerCase();

	// Assertion-like patterns (from various test frameworks)
	if (
		lowerMsg.includes('expected') &&
		(lowerMsg.includes('to equal') ||
			lowerMsg.includes('to be') ||
			lowerMsg.includes('to have') ||
			lowerMsg.includes('to match') ||
			lowerMsg.includes('to contain') ||
			lowerMsg.includes('but got') ||
			lowerMsg.includes('but received'))
	) {
		return {
			category: 'assertion',
			retryable: false,
			description: "Assertion failed — retrying won't help",
		};
	}

	// Script / syntax / reference errors — code bugs, never retry
	if (
		name === 'SyntaxError' ||
		name === 'ReferenceError' ||
		name === 'TypeError' ||
		name === 'RangeError'
	) {
		return {
			category: 'script',
			retryable: false,
			description: `${name} — likely a code bug, retrying won't help`,
		};
	}

	// Timeout patterns from generic errors
	if (lowerMsg.includes('timed out') || lowerMsg.includes('timeout')) {
		return {
			category: 'timeout',
			retryable: true,
			description: 'Timed out — environment may be slow',
		};
	}

	// Network patterns from generic errors
	if (
		lowerMsg.includes('econnrefused') ||
		lowerMsg.includes('econnreset') ||
		lowerMsg.includes('enotfound') ||
		lowerMsg.includes('fetch failed') ||
		lowerMsg.includes('network')
	) {
		return {
			category: 'network',
			retryable: true,
			description: 'Network failure — may be transient',
		};
	}

	// Default: unknown but retryable (give it a chance)
	return { category: 'unknown', retryable: true, description: 'Unknown error — will retry' };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatElementState(state: ElementState): string {
	if (!state.found) return 'Element state: NOT FOUND in DOM';

	const lines: string[] = ['Element state:'];
	if (state.tagName) lines.push(`  Tag: <${state.tagName.toLowerCase()}>`);
	if (state.id) lines.push(`  Id: #${state.id}`);
	if (state.classes) lines.push(`  Classes: ${state.classes}`);
	if (state.textPreview) lines.push(`  Text: "${state.textPreview}"`);
	if (state.visible !== undefined) lines.push(`  Visible: ${state.visible}`);
	if (state.enabled !== undefined) lines.push(`  Enabled: ${state.enabled}`);
	if (state.obscured !== undefined) lines.push(`  Obscured: ${state.obscured}`);
	if (state.boundingBox) {
		const b = state.boundingBox;
		lines.push(`  Position: (${b.x}, ${b.y}) Size: ${b.width}x${b.height}`);
	}
	return lines.join('\n');
}
