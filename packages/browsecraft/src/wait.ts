// ============================================================================
// Browsecraft - Auto Wait Engine
// Automatically waits for elements to be ready before interacting.
// Users never write sleep() or waitFor() -- it just works.
// ============================================================================

import type { BiDiSession } from 'browsecraft-bidi';

export interface WaitOptions {
	/** Max time to wait in ms */
	timeout: number;
	/** How often to poll in ms */
	interval?: number;
}

/**
 * Poll a condition until it returns a truthy value or times out.
 * This is the foundation of auto-waiting -- every action uses this.
 *
 * @param description - What we're waiting for (for error messages)
 * @param fn - The function to poll. Return truthy when done.
 * @param options - Timeout and interval settings
 */
export async function waitFor<T>(
	description: string,
	fn: () => Promise<T | null | false>,
	options: WaitOptions,
): Promise<T> {
	const { timeout, interval = 100 } = options;
	const startTime = Date.now();

	let lastError: Error | null = null;

	while (Date.now() - startTime < timeout) {
		try {
			const result = await fn();
			if (result !== null && result !== false) {
				return result;
			}
		} catch (err) {
			lastError = err instanceof Error ? err : new Error(String(err));
		}
		await sleep(interval);
	}

	const elapsed = Date.now() - startTime;
	const errorMsg = lastError ? `\nLast error: ${lastError.message}` : '';
	throw new Error(
		`Timed out after ${elapsed}ms waiting for: ${description}${errorMsg}`,
	);
}

/**
 * Wait for a page to reach a specific load state.
 */
export async function waitForLoadState(
	session: BiDiSession,
	contextId: string,
	state: 'load' | 'domcontentloaded' = 'load',
	timeout: number = 30_000,
): Promise<void> {
	// Check if already loaded by evaluating document.readyState
	const result = await session.script.evaluate({
		expression: 'document.readyState',
		target: { context: contextId },
		awaitPromise: false,
	});

	if (result.type === 'success' && result.result) {
		const readyState = (result.result as { value?: string }).value;
		if (state === 'domcontentloaded' && (readyState === 'interactive' || readyState === 'complete')) {
			return;
		}
		if (state === 'load' && readyState === 'complete') {
			return;
		}
	}

	// Subscribe and wait for the event
	const eventName = state === 'load'
		? 'browsingContext.load'
		: 'browsingContext.domContentLoaded';

	await session.subscribe([eventName], [contextId]);

	try {
		await session.waitForEvent(
			eventName,
			(event) => (event.params as { context?: string }).context === contextId,
			timeout,
		);
	} finally {
		await session.unsubscribe([eventName], [contextId]).catch(() => {});
	}
}

/**
 * Simple sleep utility.
 */
export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
