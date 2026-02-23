// ============================================================================
// AI Diagnosis — explain WHY a test failed and suggest a fix.
//
// When a test step fails, this module:
// 1. Builds a compact failure context (error, step text, page state)
// 2. Sends it to the configured LLM provider
// 3. Returns a structured diagnosis: root cause + suggested fix
//
// Zero config. Only fires when AI is available and a test actually fails.
// If no AI token is set, returns null — the framework works perfectly without it.
// ============================================================================

import { type ProviderConfig, isProviderAvailable, providerChat } from './providers.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiagnosisContext {
	/** The step or action that failed */
	stepText: string;
	/** The error message */
	errorMessage: string;
	/** The error type/name */
	errorName?: string;
	/** Failure category from classifyFailure */
	category?: string;
	/** Page URL at time of failure */
	pageUrl?: string;
	/** Page title at time of failure */
	pageTitle?: string;
	/** DOM snapshot (subset of interactive elements) */
	snapshot?: Array<{
		tag: string;
		id?: string;
		classes?: string[];
		text?: string;
		selector?: string;
	}>;
	/** Previous steps that succeeded (for context) */
	previousSteps?: string[];
}

export interface Diagnosis {
	/** One-line root cause */
	rootCause: string;
	/** Suggested fix or next debugging step */
	suggestion: string;
	/** Confidence 0-1 */
	confidence: number;
	/** Whether this looks like a test bug vs app bug */
	likelySource: 'test' | 'app' | 'environment' | 'unknown';
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Diagnose a test failure using AI.
 *
 * Returns null if no AI provider is available (graceful degradation).
 * Never throws — failures in diagnosis itself are swallowed.
 */
export async function diagnoseFailure(
	context: DiagnosisContext,
	provider?: ProviderConfig,
): Promise<Diagnosis | null> {
	try {
		if (!provider || !(await isProviderAvailable(provider))) {
			return null;
		}

		const prompt = buildPrompt(context);

		const response = await providerChat(
			[
				{
					role: 'system',
					content:
						'You are a browser test debugging expert. Analyze the failure and respond with ONLY valid JSON matching this schema: { "rootCause": string, "suggestion": string, "confidence": number (0-1), "likelySource": "test"|"app"|"environment"|"unknown" }. Be concise — one sentence each for rootCause and suggestion.',
				},
				{ role: 'user', content: prompt },
			],
			provider,
			{ temperature: 0.1, maxTokens: 300 },
		);

		if (!response) return null;
		return parseResponse(response);
	} catch {
		// Diagnosis is best-effort — never break the test run
		return null;
	}
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildPrompt(ctx: DiagnosisContext): string {
	const parts: string[] = [];

	parts.push(`## Failed Step\n${ctx.stepText}`);
	parts.push(`\n## Error\n${ctx.errorName ?? 'Error'}: ${ctx.errorMessage}`);

	if (ctx.category) {
		parts.push(`\n## Category\n${ctx.category}`);
	}

	if (ctx.pageUrl) {
		parts.push(`\n## Page\nURL: ${ctx.pageUrl}`);
		if (ctx.pageTitle) parts.push(`Title: ${ctx.pageTitle}`);
	}

	if (ctx.previousSteps?.length) {
		const recent = ctx.previousSteps.slice(-5); // last 5 steps for context
		parts.push(`\n## Previous Steps (passed)\n${recent.map((s) => `- ${s}`).join('\n')}`);
	}

	if (ctx.snapshot?.length) {
		// Only include first 20 elements to stay within token budget
		const elements = ctx.snapshot.slice(0, 20);
		const summary = elements
			.map((el) => {
				const attrs: string[] = [`<${el.tag}>`];
				if (el.id) attrs.push(`id="${el.id}"`);
				if (el.text) attrs.push(`text="${el.text.slice(0, 40)}"`);
				return attrs.join(' ');
			})
			.join('\n');
		parts.push(`\n## Page Elements (${ctx.snapshot.length} total, showing ${elements.length})\n${summary}`);
	}

	return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Response parser
// ---------------------------------------------------------------------------

function parseResponse(response: string): Diagnosis | null {
	try {
		// Extract JSON from response (may have markdown code block wrapper)
		const jsonMatch = response.match(/\{[\s\S]*\}/);
		if (!jsonMatch) return null;

		const parsed = JSON.parse(jsonMatch[0]);

		if (
			typeof parsed.rootCause !== 'string' ||
			typeof parsed.suggestion !== 'string'
		) {
			return null;
		}

		return {
			rootCause: parsed.rootCause.slice(0, 200), // cap length
			suggestion: parsed.suggestion.slice(0, 300),
			confidence: typeof parsed.confidence === 'number'
				? Math.max(0, Math.min(1, parsed.confidence))
				: 0.5,
			likelySource: ['test', 'app', 'environment', 'unknown'].includes(parsed.likelySource)
				? parsed.likelySource
				: 'unknown',
		};
	} catch {
		return null;
	}
}
