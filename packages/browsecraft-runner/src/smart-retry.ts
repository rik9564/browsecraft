// ============================================================================
// Smart Retry — Failure Classification for the Runner
//
// Classifies errors to decide if retrying is worthwhile.
// Pure algorithmic pattern matching — no AI, no external deps.
//
// Rules:
// - Element/timeout/network errors → retryable (intermittent)
// - Assertion/script errors → NOT retryable (deterministic)
// ============================================================================

export type FailureCategory =
	| 'element'
	| 'actionability'
	| 'timeout'
	| 'network'
	| 'assertion'
	| 'script'
	| 'unknown';

export interface FailureClassification {
	category: FailureCategory;
	retryable: boolean;
	description: string;
}

/**
 * Classify an error and determine if retrying is worthwhile.
 * Uses error name + message pattern matching (no instanceof — runner
 * can't import browsecraft types directly).
 */
export function classifyFailure(error: unknown): FailureClassification {
	if (!(error instanceof Error)) {
		return { category: 'unknown', retryable: true, description: 'Non-Error thrown' };
	}

	const name = error.name ?? '';
	const msg = (error.message ?? '').toLowerCase();

	// --- NOT retryable: deterministic failures ---

	// Assertion errors (Node assert, Chai, Jest, Browsecraft expect, etc.)
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

	if (
		msg.includes('expected') &&
		(msg.includes('to equal') ||
			msg.includes('to be') ||
			msg.includes('to have') ||
			msg.includes('to match') ||
			msg.includes('to contain') ||
			msg.includes('but got') ||
			msg.includes('but received'))
	) {
		return {
			category: 'assertion',
			retryable: false,
			description: "Assertion failed — retrying won't help",
		};
	}

	// Script errors — code bugs
	if (
		name === 'SyntaxError' ||
		name === 'ReferenceError' ||
		name === 'TypeError' ||
		name === 'RangeError'
	) {
		return {
			category: 'script',
			retryable: false,
			description: `${name} — code bug, retrying won't help`,
		};
	}

	// --- Retryable: intermittent failures ---

	// Browsecraft typed errors (checked by name since we can't instanceof)
	if (name === 'ElementNotFoundError') {
		return {
			category: 'element',
			retryable: true,
			description: 'Element not found — page may still be loading',
		};
	}

	if (name === 'ElementNotActionableError') {
		return {
			category: 'actionability',
			retryable: true,
			description: 'Element not actionable — may become ready',
		};
	}

	if (name === 'NetworkError') {
		return {
			category: 'network',
			retryable: true,
			description: 'Network failure — may be transient',
		};
	}

	if (name === 'TimeoutError') {
		return {
			category: 'timeout',
			retryable: true,
			description: 'Timed out — environment may be slow',
		};
	}

	// Generic timeout patterns
	if (msg.includes('timed out') || msg.includes('timeout')) {
		return {
			category: 'timeout',
			retryable: true,
			description: 'Timed out — environment may be slow',
		};
	}

	// Generic network patterns
	if (
		msg.includes('econnrefused') ||
		msg.includes('econnreset') ||
		msg.includes('enotfound') ||
		msg.includes('fetch failed') ||
		msg.includes('network')
	) {
		return {
			category: 'network',
			retryable: true,
			description: 'Network failure — may be transient',
		};
	}

	// Default: unknown, retryable (give it a chance)
	return { category: 'unknown', retryable: true, description: 'Unknown error — will retry' };
}
