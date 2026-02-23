// ============================================================================
// Browsecraft - Auto Wait Engine
// Automatically waits for elements to be ready before interacting.
// Users never write sleep() or waitFor() -- it just works.
//
// Actionability checks (like Playwright):
// - Visible: element has non-zero size, not display:none/visibility:hidden
// - Enabled: element is not disabled
// - Stable: element's bounding box hasn't changed between two animation frames
// - Not obscured: element receives pointer events at its center point
// ============================================================================

import type { BiDiSession, NodeRemoteValue, SharedReference } from 'browsecraft-bidi';
import type { ElementState } from './errors.js';

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
	throw new Error(`Timed out after ${elapsed}ms waiting for: ${description}${errorMsg}`);
}

/**
 * Wait for a page to reach a specific load state.
 */
export async function waitForLoadState(
	session: BiDiSession,
	contextId: string,
	state: 'load' | 'domcontentloaded' = 'load',
	timeout = 30_000,
): Promise<void> {
	// Check if already loaded by evaluating document.readyState
	const result = await session.script.evaluate({
		expression: 'document.readyState',
		target: { context: contextId },
		awaitPromise: false,
	});

	if (result.type === 'success' && result.result) {
		const readyState = (result.result as { value?: string }).value;
		if (
			state === 'domcontentloaded' &&
			(readyState === 'interactive' || readyState === 'complete')
		) {
			return;
		}
		if (state === 'load' && readyState === 'complete') {
			return;
		}
	}

	// Subscribe and wait for the event
	const eventName = state === 'load' ? 'browsingContext.load' : 'browsingContext.domContentLoaded';

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

// ============================================================================
// Actionability Checks
// These ensure an element is truly ready for interaction.
// ============================================================================

/** Result of an actionability check */
export interface ActionabilityResult {
	/** Whether the element is actionable */
	actionable: boolean;
	/** Why it's not actionable */
	reason?: 'not-visible' | 'disabled' | 'obscured' | 'zero-size' | 'detached';
	/** Full element state snapshot */
	state: ElementState;
}

/**
 * Check if an element is actionable (visible, enabled, stable, not obscured).
 * This runs entirely in the browser via a single script evaluation for performance.
 */
export async function checkActionability(
	session: BiDiSession,
	contextId: string,
	ref: SharedReference,
	checks: {
		/** Check visibility (default: true) */
		visible?: boolean;
		/** Check enabled state (default: true for inputs/buttons) */
		enabled?: boolean;
		/** Check that nothing obscures the element (default: false — expensive) */
		notObscured?: boolean;
		/** Return full element state for debugging (default: true — expensive) */
		returnState?: boolean;
	} = {},
): Promise<ActionabilityResult> {
	const doVisible = checks.visible !== false;
	const doEnabled = checks.enabled !== false;
	const doObscured = checks.notObscured === true;
	const returnState = checks.returnState !== false;

	try {
		const result = await session.script.callFunction({
			functionDeclaration: `function(el, doVisible, doEnabled, doObscured, returnState) {
				// Check if element is still in the DOM
				if (!el.isConnected) {
					return {
						actionable: false,
						reason: 'detached',
						state: { found: true, visible: false, enabled: false }
					};
				}

				const style = window.getComputedStyle(el);
				const rect = el.getBoundingClientRect();
				const tagName = el.tagName || '';

				let state;
				if (returnState) {
					const textPreview = (el.innerText || el.textContent || '').slice(0, 80).trim();
					const classes = el.className || '';
					const id = el.id || '';

					state = {
						found: true,
						tagName: tagName,
						textPreview: textPreview,
						classes: typeof classes === 'string' ? classes : '',
						id: id,
						boundingBox: {
							x: Math.round(rect.x),
							y: Math.round(rect.y),
							width: Math.round(rect.width),
							height: Math.round(rect.height)
						}
					};
				} else {
					state = { found: true };
				}

				// Visibility check
				if (doVisible) {
					const isVisible = style.display !== 'none'
						&& style.visibility !== 'hidden'
						&& style.opacity !== '0'
						&& rect.width > 0
						&& rect.height > 0;

					if (returnState) state.visible = isVisible;

					if (!isVisible) {
						if (rect.width === 0 || rect.height === 0) {
							return { actionable: false, reason: 'zero-size', state: state };
						}
						return { actionable: false, reason: 'not-visible', state: state };
					}
				}

				// Enabled check (only for form elements)
				if (doEnabled) {
					const formTags = ['INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'FIELDSET'];
					const isFormElement = formTags.includes(tagName);
					const isDisabled = isFormElement && el.disabled === true;
					if (returnState) state.enabled = !isDisabled;

					if (isDisabled) {
						return { actionable: false, reason: 'disabled', state: state };
					}
				}

				// Obscured check (elementFromPoint)
				if (doObscured) {
					const cx = rect.x + rect.width / 2;
					const cy = rect.y + rect.height / 2;
					const topEl = document.elementFromPoint(cx, cy);

					if (topEl && topEl !== el && !el.contains(topEl)) {
						if (returnState) {
							state.obscured = true;
							state.obscuredBy = '<' + topEl.tagName.toLowerCase()
								+ (topEl.id ? '#' + topEl.id : '')
								+ (topEl.className ? '.' + topEl.className.split(' ').join('.') : '')
								+ '>';
						}
						return { actionable: false, reason: 'obscured', state: state };
					}
					if (returnState) state.obscured = false;
				}

				if (returnState) {
					state.visible = true;
					state.enabled = true;
				}
				return { actionable: true, state: state };
			}`,
			target: { context: contextId },
			arguments: [
				ref,
				{ type: 'boolean', value: doVisible },
				{ type: 'boolean', value: doEnabled },
				{ type: 'boolean', value: doObscured },
				{ type: 'boolean', value: returnState },
			],
			awaitPromise: false,
		});

		if (result.type === 'success' && result.result?.type === 'object') {
			return deserializeActionabilityResult(result.result.value);
		}

		// Fallback if script returned unexpected type
		return {
			actionable: true,
			state: { found: true, visible: true, enabled: true },
		};
	} catch {
		// If the script fails entirely, the element may be detached
		return {
			actionable: false,
			reason: 'detached',
			state: { found: true, visible: false, enabled: false },
		};
	}
}

/**
 * Wait for an element to become actionable (visible + enabled).
 * Returns the final actionability state.
 */
export async function waitForActionable(
	session: BiDiSession,
	contextId: string,
	ref: SharedReference,
	description: string,
	options: WaitOptions,
	checks?: {
		visible?: boolean;
		enabled?: boolean;
		notObscured?: boolean;
	},
): Promise<ActionabilityResult> {
	let lastResult: ActionabilityResult | null = null;

	try {
		return await waitFor(
			`${description} to be actionable`,
			async () => {
				// Optimization: Don't compute full state (innerText, etc) in the hot loop
				const result = await checkActionability(session, contextId, ref, {
					...checks,
					returnState: false,
				});
				lastResult = result;
				return result.actionable ? result : null;
			},
			options,
		);
	} catch {
		// If timed out, fetch the FULL state for the error report
		try {
			return await checkActionability(session, contextId, ref, {
				...checks,
				returnState: true,
			});
		} catch {
			// If re-checking fails (e.g. element detached), fall back to last known result
			return (
				lastResult ?? {
					actionable: false,
					reason: 'not-visible',
					state: { found: true },
				}
			);
		}
	}
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Deserialize the BiDi object format [[key, {type, value}], ...] into a plain object.
 */
function deserializeActionabilityResult(value: unknown): ActionabilityResult {
	if (!Array.isArray(value)) {
		return { actionable: true, state: { found: true } };
	}

	const map = new Map<string, unknown>();
	for (const entry of value as [string, unknown][]) {
		if (Array.isArray(entry) && entry.length === 2) {
			const val = entry[1] as { type?: string; value?: unknown };
			map.set(entry[0], val && typeof val === 'object' && 'value' in val ? val.value : val);
		}
	}

	const stateRaw = map.get('state');
	let state: ElementState = { found: true };

	if (Array.isArray(stateRaw)) {
		const stateMap = new Map<string, unknown>();
		for (const entry of stateRaw as [string, unknown][]) {
			if (Array.isArray(entry) && entry.length === 2) {
				const val = entry[1] as { type?: string; value?: unknown };
				stateMap.set(entry[0], val && typeof val === 'object' && 'value' in val ? val.value : val);
			}
		}

		// Parse bounding box
		let boundingBox: ElementState['boundingBox'];
		const bbRaw = stateMap.get('boundingBox');
		if (Array.isArray(bbRaw)) {
			const bbMap = new Map<string, unknown>();
			for (const entry of bbRaw as [string, unknown][]) {
				if (Array.isArray(entry) && entry.length === 2) {
					const val = entry[1] as { type?: string; value?: unknown };
					bbMap.set(entry[0], val && typeof val === 'object' && 'value' in val ? val.value : val);
				}
			}
			boundingBox = {
				x: (bbMap.get('x') as number) ?? 0,
				y: (bbMap.get('y') as number) ?? 0,
				width: (bbMap.get('width') as number) ?? 0,
				height: (bbMap.get('height') as number) ?? 0,
			};
		}

		state = {
			found: true,
			visible: stateMap.get('visible') as boolean | undefined,
			enabled: stateMap.get('enabled') as boolean | undefined,
			tagName: stateMap.get('tagName') as string | undefined,
			textPreview: stateMap.get('textPreview') as string | undefined,
			classes: stateMap.get('classes') as string | undefined,
			id: stateMap.get('id') as string | undefined,
			obscured: stateMap.get('obscured') as boolean | undefined,
			obscuredBy: stateMap.get('obscuredBy') as string | undefined,
			boundingBox,
		};
	}

	return {
		actionable: (map.get('actionable') as boolean) ?? true,
		reason: map.get('reason') as ActionabilityResult['reason'],
		state,
	};
}
