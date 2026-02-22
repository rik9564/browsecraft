// ============================================================================
// Browsecraft - Smart Locator
// The magic behind page.click('Submit') -- finds elements the way humans do.
//
// Resolution chain:
// 1. Accessibility: role + name (button named "Submit")
// 2. Inner text: visible text content
// 3. Label: form labels (for inputs)
// 4. CSS selector: fallback for power users
// ============================================================================

import type { BiDiSession, Locator, NodeRemoteValue, SharedReference } from 'browsecraft-bidi';
import { waitFor, type WaitOptions } from './wait.js';

/** What the user passes to click(), fill(), get() */
export type ElementTarget = string | LocatorOptions;

/** Advanced locator options (for when you need precision) */
export interface LocatorOptions {
	/** Find by ARIA role (e.g., 'button', 'link', 'textbox') */
	role?: string;
	/** Find by accessible name or visible text */
	name?: string;
	/** Find by <label> text (for form inputs) */
	label?: string;
	/** Find by visible text content */
	text?: string;
	/** Find by data-testid attribute */
	testId?: string;
	/** Find by CSS selector */
	selector?: string;
	/** Require exact text match (default: false = partial match) */
	exact?: boolean;
	/** Which match to use if multiple found (0-based, default: 0) */
	index?: number;
}

/** Result of locating an element */
export interface LocatedElement {
	/** The node reference for BiDi commands */
	node: NodeRemoteValue;
	/** How we found it (for debugging/logging) */
	strategy: string;
}

/**
 * Find an element using the smart resolution chain.
 * This auto-waits until the element is found or timeout.
 *
 * @param session - BiDi session
 * @param contextId - Browsing context (tab/frame)
 * @param target - What to find: string or LocatorOptions
 * @param options - Wait options
 */
export async function locateElement(
	session: BiDiSession,
	contextId: string,
	target: ElementTarget,
	options: WaitOptions,
): Promise<LocatedElement> {
	const opts = normalizeTarget(target);

	return waitFor(
		describeTarget(target),
		async () => {
			// Try each strategy in order
			const strategies = buildStrategies(opts);

			for (const { locator, strategy } of strategies) {
				try {
					const result = await session.browsingContext.locateNodes({
						context: contextId,
						locator,
						maxNodeCount: (opts.index ?? 0) + 1,
					});

					if (result.nodes.length > 0) {
						const nodeIndex = opts.index ?? 0;
						const node = result.nodes[nodeIndex];
						if (node) {
							return { node, strategy };
						}
					}
				} catch {
					// This strategy didn't work -- try the next one
					continue;
				}
			}

			return null; // Not found yet -- waitFor will retry
		},
		options,
	);
}

/**
 * Find ALL matching elements (no auto-wait, returns immediately).
 */
export async function locateAllElements(
	session: BiDiSession,
	contextId: string,
	target: ElementTarget,
): Promise<LocatedElement[]> {
	const opts = normalizeTarget(target);
	const strategies = buildStrategies(opts);

	for (const { locator, strategy } of strategies) {
		try {
			const result = await session.browsingContext.locateNodes({
				context: contextId,
				locator,
				maxNodeCount: 1000,
			});

			if (result.nodes.length > 0) {
				return result.nodes.map((node) => ({ node, strategy }));
			}
		} catch {
			continue;
		}
	}

	return [];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Convert a string target into LocatorOptions */
function normalizeTarget(target: ElementTarget): LocatorOptions {
	if (typeof target === 'string') {
		return { name: target };
	}
	return target;
}

/** Human-readable description of what we're looking for */
function describeTarget(target: ElementTarget): string {
	if (typeof target === 'string') {
		return `element "${target}"`;
	}

	const parts: string[] = [];
	if (target.role) parts.push(`role="${target.role}"`);
	if (target.name) parts.push(`name="${target.name}"`);
	if (target.text) parts.push(`text="${target.text}"`);
	if (target.label) parts.push(`label="${target.label}"`);
	if (target.testId) parts.push(`testId="${target.testId}"`);
	if (target.selector) parts.push(`selector="${target.selector}"`);

	return `element [${parts.join(', ')}]`;
}

/** Build an ordered list of BiDi locator strategies to try */
function buildStrategies(opts: LocatorOptions): Array<{ locator: Locator; strategy: string }> {
	const strategies: Array<{ locator: Locator; strategy: string }> = [];
	const matchType = opts.exact ? 'full' : 'partial';

	// If user specified a specific strategy, only use that one
	if (opts.selector) {
		strategies.push({
			locator: { type: 'css', value: opts.selector },
			strategy: 'css',
		});
		return strategies;
	}

	if (opts.testId) {
		strategies.push({
			locator: { type: 'css', value: `[data-testid="${opts.testId}"]` },
			strategy: 'testId',
		});
		return strategies;
	}

	// Smart resolution chain for string targets
	const name = opts.name ?? opts.text;

	if (name) {
		// Strategy 1: Accessibility -- find by role + name
		// This is the most robust way to find elements
		if (opts.role) {
			strategies.push({
				locator: {
					type: 'accessibility',
					value: { role: opts.role, name },
				},
				strategy: `accessibility[role="${opts.role}", name="${name}"]`,
			});
		} else {
			// Try common interactive roles with this name
			for (const role of ['button', 'link', 'menuitem', 'tab']) {
				strategies.push({
					locator: {
						type: 'accessibility',
						value: { role, name },
					},
					strategy: `accessibility[role="${role}", name="${name}"]`,
				});
			}
		}

		// Strategy 2: Inner text -- find by visible text content
		strategies.push({
			locator: {
				type: 'innerText',
				value: name,
				matchType,
				ignoreCase: !opts.exact,
			},
			strategy: `innerText("${name}")`,
		});

		// Strategy 3: CSS fallback -- maybe it's a selector
		if (name.match(/^[#.\[a-z]/i)) {
			strategies.push({
				locator: { type: 'css', value: name },
				strategy: `css("${name}")`,
			});
		}
	}

	// Label strategy (for form inputs)
	if (opts.label) {
		// Find by aria-label
		strategies.push({
			locator: {
				type: 'accessibility',
				value: { name: opts.label },
			},
			strategy: `label("${opts.label}")`,
		});

		// Find by associated <label> via CSS
		strategies.push({
			locator: {
				type: 'css',
				value: `[aria-label="${opts.label}"], [placeholder="${opts.label}"]`,
			},
			strategy: `label-css("${opts.label}")`,
		});
	}

	// Role-only strategy
	if (opts.role && !name) {
		strategies.push({
			locator: {
				type: 'accessibility',
				value: { role: opts.role },
			},
			strategy: `role("${opts.role}")`,
		});
	}

	return strategies;
}
