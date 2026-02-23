// ============================================================================
// Self-healing selectors — when a selector fails, attempt to find the
// most likely replacement by analyzing the current page DOM.
//
// Works WITHOUT AI: uses Levenshtein distance + attribute similarity.
// Works BETTER with AI: uses any configured provider for intelligent matching.
//
// Layer architecture:
//   1. Heuristics (Levenshtein + attributes) — always runs, zero cost
//   2. AI disambiguation — only fires when heuristics are uncertain (<0.8)
// ============================================================================

import type { ProviderConfig } from './providers.js';
import { isProviderAvailable, providerChat } from './providers.js';

/** A snapshot of the page DOM used for healing */
export interface PageSnapshot {
	/** Page URL */
	url: string;
	/** Page title */
	title: string;
	/** Simplified DOM tree — each element as a flat record */
	elements: ElementInfo[];
}

export interface ElementInfo {
	/** Tag name (e.g. "button", "input") */
	tag: string;
	/** Element id attribute */
	id?: string;
	/** CSS classes */
	classes?: string[];
	/** Visible inner text (trimmed, max 200 chars) */
	text?: string;
	/** Accessible name from aria-label or title */
	ariaLabel?: string;
	/** Role attribute */
	role?: string;
	/** Type attribute (for inputs) */
	type?: string;
	/** Name attribute */
	name?: string;
	/** Placeholder text */
	placeholder?: string;
	/** href for links */
	href?: string;
	/** data-testid attribute */
	testId?: string;
	/** A generated CSS selector that uniquely identifies this element */
	selector: string;
}

export interface HealResult {
	/** Whether healing was successful */
	healed: boolean;
	/** The new suggested selector */
	selector: string | null;
	/** Confidence score 0-1 */
	confidence: number;
	/** How the healing was done */
	method: 'ai' | 'text-similarity' | 'attribute-match' | 'none';
	/** Human-readable explanation */
	explanation: string;
	/** All candidates considered, sorted by confidence */
	candidates: Array<{ selector: string; confidence: number; reason: string }>;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Attempt to heal a broken selector by finding the most likely match
 * in the current page state.
 *
 * ```ts
 * const snapshot = await captureSnapshot(page);
 * const result = await healSelector('#old-submit-btn', snapshot, {
 *   context: 'login form submit button',
 * });
 * if (result.healed) {
 *   console.log(`Use ${result.selector} instead`);
 * }
 * ```
 */
export async function healSelector(
	failedSelector: string,
	snapshot: PageSnapshot,
	options: {
		/** Optional hint about what the element should be */
		context?: string;
		/** Try AI healing when heuristics are uncertain (default true) */
		useAI?: boolean;
		/** AI provider config. Auto-detects from env when omitted. */
		provider?: ProviderConfig;
		/** @deprecated Use `provider.token` instead. GitHub token for AI features. */
		token?: string;
		/** Minimum confidence threshold (default 0.3) */
		minConfidence?: number;
	} = {},
): Promise<HealResult> {
	const { context, useAI = true, token, minConfidence = 0.3 } = options;

	// Resolve provider: explicit > legacy token > default github-models
	const provider: ProviderConfig = options.provider ?? {
		provider: 'github-models',
		token: token || undefined,
	};

	// 1. Try non-AI heuristics first (fast, always available)
	const heuristicResult = heuristicHeal(failedSelector, snapshot, context, minConfidence);

	// If we got a high-confidence heuristic match, return immediately
	if (heuristicResult.healed && heuristicResult.confidence >= 0.8) {
		return heuristicResult;
	}

	// 2. Try AI healing if enabled — only when heuristics are uncertain
	if (useAI) {
		try {
			const available = await isProviderAvailable(provider);
			if (available) {
				const aiResult = await aiHeal(failedSelector, snapshot, context, provider);
				if (aiResult && aiResult.confidence > heuristicResult.confidence) {
					return aiResult;
				}
			}
		} catch {
			// AI failed, fall through to heuristic result
		}
	}

	// 3. Return heuristic result if it meets minimum confidence
	if (heuristicResult.confidence >= minConfidence) {
		return heuristicResult;
	}

	return {
		healed: false,
		selector: null,
		confidence: 0,
		method: 'none',
		explanation: `Could not find a replacement for "${failedSelector}"`,
		candidates: heuristicResult.candidates,
	};
}

// ---------------------------------------------------------------------------
// Heuristic (non-AI) healing
// ---------------------------------------------------------------------------

function heuristicHeal(
	failedSelector: string,
	snapshot: PageSnapshot,
	context?: string,
	minConfidence = 0.3,
): HealResult {
	const candidates: HealResult['candidates'] = [];
	const parsed = parseSelector(failedSelector);

	for (const el of snapshot.elements) {
		let score = 0;
		const reasons: string[] = [];

		// ID similarity
		if (parsed.id && el.id) {
			const sim = stringSimilarity(parsed.id, el.id);
			if (sim >= 0.5) {
				score += sim * 0.4;
				reasons.push(`ID similar: "${el.id}" (${(sim * 100).toFixed(0)}%)`);
			}
		}

		// Class overlap
		if (parsed.classes.length > 0 && el.classes && el.classes.length > 0) {
			const overlap = setOverlap(parsed.classes, el.classes);
			if (overlap > 0) {
				score += overlap * 0.2;
				reasons.push(`Class overlap: ${(overlap * 100).toFixed(0)}%`);
			}
		}

		// Tag match
		if (parsed.tag && el.tag === parsed.tag) {
			score += 0.1;
			reasons.push(`Tag matches: ${el.tag}`);
		}

		// Text similarity (for text-based selectors)
		if (parsed.text && el.text) {
			const sim = stringSimilarity(parsed.text.toLowerCase(), el.text.toLowerCase());
			if (sim >= 0.4) {
				score += sim * 0.35;
				reasons.push(`Text similar: "${el.text.slice(0, 50)}" (${(sim * 100).toFixed(0)}%)`);
			}
		}

		// Context matching — if the caller told us what the element is
		if (context) {
			const contextLower = context.toLowerCase();
			const combined = [el.text, el.ariaLabel, el.placeholder, el.id, el.name, el.role]
				.filter(Boolean)
				.join(' ')
				.toLowerCase();

			const sim = stringSimilarity(contextLower, combined);
			if (sim >= 0.3) {
				score += sim * 0.25;
				reasons.push(`Context match: "${context}" (${(sim * 100).toFixed(0)}%)`);
			}
		}

		// Attribute matches (data-testid, name, placeholder)
		if (parsed.testId && el.testId) {
			const sim = stringSimilarity(parsed.testId, el.testId);
			if (sim >= 0.5) {
				score += sim * 0.3;
				reasons.push(`TestId similar: "${el.testId}"`);
			}
		}

		if (parsed.name && el.name) {
			const sim = stringSimilarity(parsed.name, el.name);
			if (sim >= 0.5) {
				score += sim * 0.2;
				reasons.push(`Name similar: "${el.name}"`);
			}
		}

		// Normalize score to 0-1
		const confidence = Math.min(score, 1);

		if (confidence > Math.min(minConfidence * 0.5, 0.15)) {
			candidates.push({
				selector: el.selector,
				confidence,
				reason: reasons.join('; '),
			});
		}
	}

	// Sort by confidence descending
	candidates.sort((a, b) => b.confidence - a.confidence);

	const best = candidates[0];
	if (best && best.confidence >= minConfidence) {
		return {
			healed: true,
			selector: best.selector,
			confidence: best.confidence,
			method: best.reason.includes('Text similar') ? 'text-similarity' : 'attribute-match',
			explanation: `Found likely replacement: ${best.reason}`,
			candidates: candidates.slice(0, 5),
		};
	}

	return {
		healed: false,
		selector: null,
		confidence: 0,
		method: 'none',
		explanation: 'No heuristic match found',
		candidates: candidates.slice(0, 5),
	};
}

// ---------------------------------------------------------------------------
// AI-powered healing via GitHub Models
// ---------------------------------------------------------------------------

async function aiHeal(
	failedSelector: string,
	snapshot: PageSnapshot,
	context?: string,
	provider?: ProviderConfig,
): Promise<HealResult | null> {
	// Build a compact DOM summary (keep it under ~2000 tokens)
	const elementSummaries = snapshot.elements
		.slice(0, 50) // limit to 50 elements to avoid huge prompts
		.map((el, i) => {
			const parts = [`[${i}] <${el.tag}>`];
			if (el.id) parts.push(`id="${el.id}"`);
			if (el.classes?.length) parts.push(`class="${el.classes.join(' ')}"`);
			if (el.text) parts.push(`text="${el.text.slice(0, 80)}"`);
			if (el.ariaLabel) parts.push(`aria-label="${el.ariaLabel}"`);
			if (el.role) parts.push(`role="${el.role}"`);
			if (el.type) parts.push(`type="${el.type}"`);
			if (el.name) parts.push(`name="${el.name}"`);
			if (el.placeholder) parts.push(`placeholder="${el.placeholder}"`);
			if (el.testId) parts.push(`data-testid="${el.testId}"`);
			parts.push(`selector="${el.selector}"`);
			return parts.join(' ');
		})
		.join('\n');

	const prompt = `A CSS selector failed to find an element on a web page. Help me find the correct replacement selector.

Failed selector: ${failedSelector}
Page URL: ${snapshot.url}
Page title: ${snapshot.title}
${context ? `Context: ${context}` : ''}

Here are the elements currently on the page:
${elementSummaries}

Instructions:
- Identify which element is most likely the one the failed selector was trying to target.
- Respond with ONLY a JSON object in this exact format (no markdown, no explanation):
{"index": <element_index>, "selector": "<css_selector>", "confidence": <0.0-1.0>, "reason": "<brief explanation>"}

If no element matches, respond with:
{"index": -1, "selector": null, "confidence": 0, "reason": "No matching element found"}`;

	const resolvedProvider: ProviderConfig = provider ?? { provider: 'github-models' };

	const response = await providerChat(
		[
			{
				role: 'system',
				content:
					'You are a web testing expert. You analyze DOM structures and CSS selectors. Always respond with valid JSON only.',
			},
			{ role: 'user', content: prompt },
		],
		resolvedProvider,
		{ temperature: 0.1, maxTokens: 256 },
	);

	if (!response) return null;

	try {
		// Extract JSON from response (handle markdown code blocks)
		const jsonStr = response.replace(/```json?\s*|\s*```/g, '').trim();
		const parsed = JSON.parse(jsonStr) as {
			index: number;
			selector: string | null;
			confidence: number;
			reason: string;
		};

		if (parsed.index < 0 || !parsed.selector || parsed.confidence < 0.2) {
			return null;
		}

		return {
			healed: true,
			selector: parsed.selector,
			confidence: parsed.confidence,
			method: 'ai',
			explanation: `AI suggestion: ${parsed.reason}`,
			candidates: [
				{
					selector: parsed.selector,
					confidence: parsed.confidence,
					reason: parsed.reason,
				},
			],
		};
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

interface ParsedSelector {
	tag?: string;
	id?: string;
	classes: string[];
	text?: string;
	testId?: string;
	name?: string;
}

/** Extract meaningful parts from a CSS selector string */
function parseSelector(selector: string): ParsedSelector {
	const result: ParsedSelector = { classes: [] };

	// Extract ID: #some-id
	const idMatch = selector.match(/#([\w-]+)/);
	if (idMatch) result.id = idMatch[1];

	// Extract classes: .class-name
	const classMatches = selector.matchAll(/\.([\w-]+)/g);
	for (const m of classMatches) {
		if (m[1]) result.classes.push(m[1]);
	}

	// Extract tag: starts with a word before any # . [ :
	const tagMatch = selector.match(/^(\w+)/);
	if (tagMatch?.[1] && !tagMatch[1].match(/^(id|class|type|name)$/)) {
		result.tag = tagMatch[1];
	}

	// Extract data-testid
	const testIdMatch = selector.match(/\[data-testid=["']?([\w-]+)["']?\]/);
	if (testIdMatch) result.testId = testIdMatch[1];

	// Extract name attribute
	const nameMatch = selector.match(/\[name=["']?([\w-]+)["']?\]/);
	if (nameMatch) result.name = nameMatch[1];

	// If the selector looks like plain text (no CSS special chars), treat it as text
	if (!selector.match(/[#.\[\]:>+~=]/)) {
		result.text = selector;
	}

	return result;
}

/** Levenshtein-based string similarity (0 to 1) */
function stringSimilarity(a: string, b: string): number {
	if (a === b) return 1;
	if (!a || !b) return 0;

	const maxLen = Math.max(a.length, b.length);
	if (maxLen === 0) return 1;

	const dist = levenshtein(a, b);
	return 1 - dist / maxLen;
}

/** Compute Levenshtein edit distance */
function levenshtein(a: string, b: string): number {
	const m = a.length;
	const n = b.length;

	// Use single-row optimization for memory efficiency
	const row = Array.from({ length: n + 1 }, (_, i) => i);

	for (let i = 1; i <= m; i++) {
		let prev = i;
		for (let j = 1; j <= n; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			const val = Math.min(
				(row[j] ?? 0) + 1, // deletion
				prev + 1, // insertion
				(row[j - 1] ?? 0) + cost, // substitution
			);
			row[j - 1] = prev;
			prev = val;
		}
		row[n] = prev;
	}

	return row[n] ?? 0;
}

/** Compute overlap ratio between two sets of strings */
function setOverlap(a: string[], b: string[]): number {
	const setA = new Set(a);
	const setB = new Set(b);
	let intersection = 0;

	// Iterate over the smaller set to minimize work
	if (setA.size < setB.size) {
		for (const item of setA) {
			if (setB.has(item)) intersection++;
		}
	} else {
		for (const item of setB) {
			if (setA.has(item)) intersection++;
		}
	}

	const unionSize = setA.size + setB.size - intersection;
	return unionSize > 0 ? intersection / unionSize : 0;
}
