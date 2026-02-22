// ============================================================================
// Step Definition Registry — register, match, and execute step definitions.
//
// Supports:
// - String patterns with {string}, {int}, {float}, {word} placeholders
// - Regex patterns
// - Exact string match (for simple cases)
// - Cucumber Expression-compatible parameter types
// - Custom parameter types
// - Global + scoped step registries
// ============================================================================

import type { DataTable as GherkinDataTable, DocString } from './gherkin-parser.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The context object passed to every step definition */
export interface StepWorld {
	/** The current page (injected by executor) */
	page: unknown;
	/** The current browser (injected by executor) */
	browser: unknown;
	/** Shared state between steps within a scenario */
	ctx: Record<string, unknown>;
	/** Attach data to the step (for reporting) */
	attach: (data: string | Buffer, mediaType?: string) => void;
	/** Log a message to the step report */
	log: (message: string) => void;
}

export type StepFunction = (
	world: StepWorld,
	...args: unknown[]
) => void | Promise<void>;

export interface StepDefinition {
	/** Original pattern (string or regex) */
	pattern: string | RegExp;
	/** Compiled regex for matching */
	regex: RegExp;
	/** Parameter names extracted from the pattern */
	paramNames: string[];
	/** The function to execute */
	fn: StepFunction;
	/** Source location for debugging */
	location?: { file: string; line: number };
	/** Step type: 'Given' | 'When' | 'Then' | 'Any' */
	type: StepType;
	/** Optional tag scope — step only matches in scenarios with this tag */
	tagScope?: string;
}

export type StepType = 'Given' | 'When' | 'Then' | 'Any';

export interface StepMatch {
	/** The matched step definition */
	definition: StepDefinition;
	/** Extracted parameter values */
	args: unknown[];
}

// ---------------------------------------------------------------------------
// Built-in parameter types
// ---------------------------------------------------------------------------

interface ParameterType {
	name: string;
	regex: string;
	transform: (raw: string) => unknown;
}

const BUILT_IN_PARAMETERS: ParameterType[] = [
	{
		name: 'string',
		regex: '"([^"]*)"',
		transform: (s) => s,
	},
	{
		name: 'int',
		regex: '(-?\\d+)',
		transform: (s) => parseInt(s, 10),
	},
	{
		name: 'float',
		regex: '(-?\\d+\\.\\d+)',
		transform: (s) => parseFloat(s),
	},
	{
		name: 'word',
		regex: '(\\S+)',
		transform: (s) => s,
	},
	{
		name: 'any',
		regex: '(.*)',
		transform: (s) => s,
	},
];

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export class StepRegistry {
	private steps: StepDefinition[] = [];
	private customParameters: ParameterType[] = [];

	/**
	 * Register a step definition.
	 *
	 * Pattern can be:
	 * - A string with Cucumber-style parameters: `'I have {int} items in my cart'`
	 * - A regex: `/I have (\d+) items in my cart/`
	 * - A plain string for exact match: `'I am on the homepage'`
	 */
	register(
		type: StepType,
		pattern: string | RegExp,
		fn: StepFunction,
		options?: { tagScope?: string; location?: { file: string; line: number } },
	): void {
		const { regex, paramNames } = this.compilePattern(pattern);

		// Check for duplicates
		const existing = this.steps.find(
			(s) => s.regex.source === regex.source && s.type === type,
		);
		if (existing) {
			const loc = options?.location ? ` at ${options.location.file}:${options.location.line}` : '';
			throw new Error(
				`Duplicate step definition: "${pattern}"${loc}. ` +
				`Already registered as "${existing.pattern}"`,
			);
		}

		this.steps.push({
			pattern,
			regex,
			paramNames,
			fn,
			type,
			tagScope: options?.tagScope,
			location: options?.location,
		});
	}

	/**
	 * Register a custom parameter type.
	 *
	 * ```ts
	 * registry.defineParameterType({
	 *   name: 'color',
	 *   regex: '(red|green|blue)',
	 *   transform: (s) => s,
	 * });
	 * // Now you can use: Given('I pick a {color} shirt', ...)
	 * ```
	 */
	defineParameterType(param: ParameterType): void {
		this.customParameters.push(param);
	}

	/**
	 * Find a matching step definition for a step text.
	 * Returns null if no match found.
	 */
	match(text: string, keywordType?: StepType, scenarioTags?: string[]): StepMatch | null {
		for (const def of this.steps) {
			// Type filter: 'Any' matches everything, otherwise must match
			if (def.type !== 'Any' && keywordType && keywordType !== 'Any' && def.type !== keywordType) {
				continue;
			}

			// Tag scope filter
			if (def.tagScope && scenarioTags) {
				if (!scenarioTags.includes(def.tagScope)) continue;
			}

			const m = def.regex.exec(text);
			if (m) {
				const rawArgs = m.slice(1);
				const args = this.transformArgs(rawArgs, def);
				return { definition: def, args };
			}
		}
		return null;
	}

	/**
	 * Find all step definitions. Useful for reporting and AI analysis.
	 */
	getAll(): StepDefinition[] {
		return [...this.steps];
	}

	/**
	 * Clear all registered steps. Useful for test isolation.
	 */
	clear(): void {
		this.steps = [];
	}

	/**
	 * Get pending (unmatched) steps from a list of step texts.
	 */
	findUnmatched(stepTexts: string[]): string[] {
		return stepTexts.filter((text) => !this.match(text));
	}

	/**
	 * Suggest similar step definitions for an unmatched step.
	 * Returns the top N matches by Levenshtein distance.
	 */
	suggest(text: string, limit = 3): StepDefinition[] {
		const scored = this.steps.map((def) => ({
			def,
			distance: levenshtein(text.toLowerCase(), patternToReadable(def.pattern).toLowerCase()),
		}));
		scored.sort((a, b) => a.distance - b.distance);
		return scored.slice(0, limit).map((s) => s.def);
	}

	// -----------------------------------------------------------------------
	// Internal
	// -----------------------------------------------------------------------

	private compilePattern(pattern: string | RegExp): {
		regex: RegExp;
		paramNames: string[];
	} {
		if (pattern instanceof RegExp) {
			return { regex: pattern, paramNames: [] };
		}

		const allParams = [...BUILT_IN_PARAMETERS, ...this.customParameters];
		const paramNames: string[] = [];
		let regexStr = pattern;

		// Replace {paramType} placeholders with regex groups
		regexStr = regexStr.replace(/\{(\w+)\}/g, (_match, name: string) => {
			const param = allParams.find((p) => p.name === name);
			if (param) {
				paramNames.push(name);
				return param.regex;
			}
			// Unknown parameter type — treat as {any}
			paramNames.push(name);
			return '(.*)';
		});

		// Escape special regex chars that aren't already part of our replacements
		// We need to be careful not to escape the regex groups we just inserted
		// Strategy: only escape chars that are NOT inside capture groups
		// Actually, let's just build properly from the start

		// Re-do: split pattern by parameter placeholders, escape the literal parts
		const parts = pattern.split(/\{(\w+)\}/);
		let finalRegex = '^';
		const finalParamNames: string[] = [];

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i] ?? '';
			if (i % 2 === 0) {
				// Literal text — escape regex special chars
				finalRegex += escapeRegex(part);
			} else {
				// Parameter name
				const param = allParams.find((p) => p.name === part);
				if (param) {
					finalParamNames.push(part);
					finalRegex += param.regex;
				} else {
					finalParamNames.push(part);
					finalRegex += '(.*)';
				}
			}
		}
		finalRegex += '$';

		return { regex: new RegExp(finalRegex), paramNames: finalParamNames };
	}

	private transformArgs(rawArgs: string[], def: StepDefinition): unknown[] {
		const allParams = [...BUILT_IN_PARAMETERS, ...this.customParameters];

		return rawArgs.map((raw, i) => {
			const paramName = def.paramNames[i];
			if (paramName) {
				const param = allParams.find((p) => p.name === paramName);
				if (param) {
					return param.transform(raw);
				}
			}
			return raw;
		});
	}
}

// ---------------------------------------------------------------------------
// DataTable helper class (for use in step definitions)
// ---------------------------------------------------------------------------

export class BrowsecraftDataTable {
	constructor(private readonly table: GherkinDataTable) {}

	/** Get raw rows as arrays of strings */
	raw(): string[][] {
		return this.table.rows.map((r) => r.cells.map((c) => c.value));
	}

	/** Get rows as arrays (excluding the header row) */
	rows(): string[][] {
		return this.raw().slice(1);
	}

	/** Get the header row */
	headers(): string[] {
		const first = this.table.rows[0];
		return first ? first.cells.map((c) => c.value) : [];
	}

	/**
	 * Convert to an array of objects using the first row as keys.
	 *
	 * ```ts
	 * // | name  | age |
	 * // | Alice | 30  |
	 * // | Bob   | 25  |
	 * //
	 * // → [{ name: 'Alice', age: '30' }, { name: 'Bob', age: '25' }]
	 * ```
	 */
	asObjects(): Record<string, string>[] {
		const hdrs = this.headers();
		return this.rows().map((row) => {
			const obj: Record<string, string> = {};
			for (let i = 0; i < hdrs.length; i++) {
				const key = hdrs[i];
				if (key) {
					obj[key] = row[i] ?? '';
				}
			}
			return obj;
		});
	}

	/**
	 * Convert a two-column table to a key-value map.
	 *
	 * ```ts
	 * // | key    | value |
	 * // | name   | Alice |
	 * // | age    | 30    |
	 * //
	 * // → { name: 'Alice', age: '30' }
	 * ```
	 */
	asMap(): Record<string, string> {
		const map: Record<string, string> = {};
		for (const row of this.raw()) {
			const key = row[0];
			const val = row[1];
			if (key !== undefined) {
				map[key] = val ?? '';
			}
		}
		return map;
	}

	/**
	 * Get a single column as an array of strings.
	 */
	column(index: number): string[] {
		return this.table.rows.map((r) => r.cells[index]?.value ?? '');
	}

	/**
	 * Get the number of rows (including header).
	 */
	get rowCount(): number {
		return this.table.rows.length;
	}

	/**
	 * Transpose the table (swap rows and columns).
	 */
	transpose(): string[][] {
		const raw = this.raw();
		if (raw.length === 0) return [];
		const cols = raw[0]?.length ?? 0;
		const result: string[][] = [];
		for (let c = 0; c < cols; c++) {
			result.push(raw.map((row) => row[c] ?? ''));
		}
		return result;
	}
}

// ---------------------------------------------------------------------------
// Global registry + convenience functions
// ---------------------------------------------------------------------------

/** The global step registry — used by Given/When/Then functions */
export const globalRegistry = new StepRegistry();

/**
 * Register a Given step definition.
 *
 * ```ts
 * Given('I am on the {string} page', async ({ page }, pageName) => {
 *   await page.goto(`/${pageName}`);
 * });
 * ```
 */
export function Given(pattern: string | RegExp, fn: StepFunction): void {
	globalRegistry.register('Given', pattern, fn);
}

/**
 * Register a When step definition.
 *
 * ```ts
 * When('I click {string}', async ({ page }, text) => {
 *   await page.click(text);
 * });
 * ```
 */
export function When(pattern: string | RegExp, fn: StepFunction): void {
	globalRegistry.register('When', pattern, fn);
}

/**
 * Register a Then step definition.
 *
 * ```ts
 * Then('I should see {string}', async ({ page }, text) => {
 *   const content = await page.content();
 *   if (!content.includes(text)) throw new Error(`"${text}" not found`);
 * });
 * ```
 */
export function Then(pattern: string | RegExp, fn: StepFunction): void {
	globalRegistry.register('Then', pattern, fn);
}

/**
 * Register a step that matches any keyword (Given/When/Then/And/But).
 *
 * ```ts
 * Step('I wait {int} seconds', async (_, seconds) => {
 *   await new Promise(r => setTimeout(r, seconds * 1000));
 * });
 * ```
 */
export function Step(pattern: string | RegExp, fn: StepFunction): void {
	globalRegistry.register('Any', pattern, fn);
}

/**
 * Define a custom parameter type for use in step patterns.
 *
 * ```ts
 * defineParameterType({
 *   name: 'boolean',
 *   regex: '(true|false)',
 *   transform: (s) => s === 'true',
 * });
 * // Now: Given('the feature is {boolean}', ...)
 * ```
 */
export function defineParameterType(param: ParameterType): void {
	globalRegistry.defineParameterType(param);
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function patternToReadable(pattern: string | RegExp): string {
	if (pattern instanceof RegExp) return pattern.source;
	return pattern;
}

/** Levenshtein edit distance for step suggestion */
function levenshtein(a: string, b: string): number {
	const m = a.length;
	const n = b.length;
	const row = Array.from({ length: n + 1 }, (_, i) => i);

	for (let i = 1; i <= m; i++) {
		let prev = i;
		for (let j = 1; j <= n; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			const val = Math.min(
				(row[j] ?? 0) + 1,
				prev + 1,
				(row[j - 1] ?? 0) + cost,
			);
			row[j - 1] = prev;
			prev = val;
		}
		row[n] = prev;
	}

	return row[n] ?? 0;
}
