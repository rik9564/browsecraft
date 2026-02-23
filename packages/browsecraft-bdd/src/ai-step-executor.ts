// ============================================================================
// AI Step Executor — runtime AI-powered step execution.
//
// Instead of maintaining a static library of step definitions,
// this module uses an LLM to interpret ANY Gherkin step text at runtime
// and execute the appropriate Browsecraft page actions.
//
// Architecture:
//   1. Step text arrives (e.g., "When I add the first product to cart")
//   2. AI interprets intent → produces an action plan (JSON)
//   3. Action plan is validated against a safe allow-list of page methods
//   4. Actions are executed sequentially against the real page
//   5. Action plans are cached by normalized step text → zero AI calls on repeat
//
// Supported providers:
//   - GitHub Models (free, default)
//   - OpenAI (gpt-4o, gpt-4o-mini)
//   - Anthropic (Claude)
//   - Ollama (local)
//
// Safety:
//   - Only allow-listed page methods can be called (no eval, no arbitrary code)
//   - Action plans are validated before execution
//   - Timeout on both AI call and action execution
//   - Graceful fallback: if AI is unavailable, returns 'undefined' status
//
// Performance:
//   - LRU cache with configurable size (default 500 entries)
//   - Identical step text = instant replay from cache
//   - Parameterized steps share cache entries via normalization
//
// Zero manual step maintenance. Zero pattern registration. Just write
// your .feature file in plain English and run it.
// ============================================================================

import type { ChatMessage } from 'browsecraft-ai';
import {
	type ProviderConfig,
	getProviderLabel,
	isProviderAvailable,
	providerChat,
} from 'browsecraft-ai';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single browser action the AI decides to execute */
export interface PageAction {
	/** The page method to call */
	method: AllowedMethod;
	/** Arguments to pass to the method */
	args: unknown[];
	/** Human-readable description of what this action does */
	description: string;
}

/** The AI's interpretation of a step */
export interface ActionPlan {
	/** Ordered list of actions to execute */
	actions: PageAction[];
	/** Whether this is an assertion step (Then) vs an action step (When/Given) */
	isAssertion: boolean;
	/** Confidence score 0-1 */
	confidence: number;
	/** Human-readable explanation of the interpretation */
	explanation: string;
}

/** Result of executing an AI-interpreted step */
export interface AIStepResult {
	/** Whether the step was handled by AI */
	handled: boolean;
	/** The action plan that was produced */
	plan: ActionPlan | null;
	/** Whether the step passed */
	passed: boolean;
	/** Error if the step failed */
	error?: Error;
	/** Whether the plan came from cache */
	cached: boolean;
	/** Time spent on AI interpretation (ms) */
	aiTime: number;
	/** Time spent on execution (ms) */
	execTime: number;
}

/** Configuration for the AI step executor */
export interface AIStepExecutorConfig {
	/**
	 * AI provider config. When omitted, auto-detects from env vars.
	 *
	 * ```ts
	 * // GitHub Models (free, default)
	 * provider: { provider: 'github-models' }
	 *
	 * // OpenAI
	 * provider: { provider: 'openai', token: process.env.OPENAI_API_KEY }
	 *
	 * // Anthropic
	 * provider: { provider: 'anthropic' }
	 *
	 * // Ollama (local)
	 * provider: { provider: 'ollama', model: 'llama3.2' }
	 * ```
	 */
	provider?: ProviderConfig;
	/**
	 * @deprecated Use `provider.token` instead. Kept for backward compatibility.
	 * GitHub token for AI. Default: from env.
	 */
	token?: string;
	/**
	 * @deprecated Use `provider.model` instead. Kept for backward compatibility.
	 * Model to use. Default: provider-specific default.
	 */
	model?: string;
	/** Maximum cache entries. Default: 500 */
	cacheSize?: number;
	/** Timeout for AI call in ms. Default: 15000 */
	aiTimeout?: number;
	/** Timeout for each action execution in ms. Default: 30000 */
	actionTimeout?: number;
	/** Whether to enable AI step execution. Default: true */
	enabled?: boolean;
	/** Whether to log action plans (for debugging). Default: false */
	debug?: boolean;
	/** Application context hint to help AI understand the app */
	appContext?: string;
	/**
	 * Persistent cache file path. When set, action plans are saved to disk
	 * and restored on startup — zero AI calls on repeat runs.
	 * Default: '.browsecraft/ai-cache.json'
	 * Set to null to disable persistence.
	 */
	cachePath?: string | null;
	/**
	 * Minimum confidence to persist a plan to the cache file.
	 * Plans below this threshold are used once but not saved,
	 * forcing a fresh AI call next run. Default: 0.8
	 */
	confidenceThreshold?: number;
	/**
	 * Cache mode:
	 * - 'auto'   — use cache if available, call AI for misses (default)
	 * - 'locked' — ONLY use cached plans, never call AI (for CI without API keys)
	 * - 'warm'   — always call AI, update cache, even on cache hits
	 */
	cacheMode?: 'auto' | 'locked' | 'warm';
}

// ---------------------------------------------------------------------------
// Allow-listed page methods — ONLY these can be called by AI
// ---------------------------------------------------------------------------

const ALLOWED_METHODS = new Set([
	// Navigation
	'goto',
	'reload',
	'goBack',
	'goForward',
	// Interaction
	'click',
	'dblclick',
	'fill',
	'type',
	'press',
	'check',
	'uncheck',
	'select',
	'hover',
	'tap',
	'focus',
	'dragTo',
	// Waiting
	'waitForSelector',
	'waitForURL',
	'waitForText',
	'waitForLoadState',
	// Query
	'innerText',
	'textContent',
	'inputValue',
	'title',
	'url',
	'content',
	'screenshot',
	// Visibility
	'see',
	// Assertions (methods that throw on mismatch)
	'acceptDialog',
	'dismissDialog',
	'clearCookies',
	// Evaluate (limited — only for assertions)
	'evaluate',
] as const);

type AllowedMethod = typeof ALLOWED_METHODS extends Set<infer T> ? T : never;

// ---------------------------------------------------------------------------
// LRU Cache
// ---------------------------------------------------------------------------

class LRUCache<K, V> {
	private readonly max: number;
	private readonly cache = new Map<K, V>();

	constructor(max: number) {
		this.max = max;
	}

	get(key: K): V | undefined {
		const value = this.cache.get(key);
		if (value !== undefined) {
			// Move to end (most recently used)
			this.cache.delete(key);
			this.cache.set(key, value);
		}
		return value;
	}

	set(key: K, value: V): void {
		if (this.cache.has(key)) {
			this.cache.delete(key);
		} else if (this.cache.size >= this.max) {
			// Evict oldest entry
			const firstKey = this.cache.keys().next().value;
			if (firstKey !== undefined) {
				this.cache.delete(firstKey);
			}
		}
		this.cache.set(key, value);
	}

	delete(key: K): boolean {
		return this.cache.delete(key);
	}

	get size(): number {
		return this.cache.size;
	}

	clear(): void {
		this.cache.clear();
	}

	entries(): IterableIterator<[K, V]> {
		return this.cache.entries();
	}
}

// ---------------------------------------------------------------------------
// Normalization — collapse variable parts so cache hits are maximized
// ---------------------------------------------------------------------------

/**
 * Normalize step text for cache keying.
 * Replaces quoted strings and numbers with placeholders so that
 * `I fill "Username" with "alice"` and `I fill "Email" with "bob@x.com"`
 * produce DIFFERENT cache keys (args matter for action plans),
 * but structurally identical steps like the same text run twice reuse cache.
 */
function normalizeForCache(stepText: string): string {
	return stepText.trim().toLowerCase();
}

function isPromiseLike<T = unknown>(value: unknown): value is PromiseLike<T> {
	return (
		typeof value === 'object' &&
		value !== null &&
		'then' in value &&
		typeof (value as { then?: unknown }).then === 'function'
	);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
	let timer: NodeJS.Timeout | undefined;

	try {
		return await new Promise<T>((resolve, reject) => {
			timer = setTimeout(() => {
				reject(new Error(message));
			}, timeoutMs);

			if (timer && typeof timer === 'object' && 'unref' in timer) {
				timer.unref();
			}

			promise.then(resolve, reject);
		});
	} finally {
		if (timer) {
			clearTimeout(timer);
		}
	}
}

// ---------------------------------------------------------------------------
// System prompt — teaches the AI about the Browsecraft page API
// ---------------------------------------------------------------------------

function buildSystemPrompt(appContext?: string): string {
	const contextBlock = appContext
		? `\n\nApplication context (use this to understand the app being tested):\n${appContext}\n`
		: '';

	return `You are a browser test step interpreter for the Browsecraft testing framework.
Your job: given a Gherkin step in plain English, produce a JSON action plan that the test runner will execute.

RESPOND WITH ONLY VALID JSON. No markdown, no explanation, no code fences.

The action plan schema:
{
  "actions": [
    { "method": "<page_method>", "args": [<arg1>, <arg2>, ...], "description": "<what this does>" }
  ],
  "isAssertion": <true if this is a Then/verification step, false otherwise>,
  "confidence": <0.0 to 1.0>,
  "explanation": "<one sentence explaining what the step does>"
}

Available page methods (ONLY use these):
Navigation:
  goto(url) — navigate to URL
  reload() — reload page
  goBack() — browser back
  goForward() — browser forward

Interaction:
  click(target) — click element by visible text, label, CSS selector, or aria-label
  dblclick(target) — double-click
  fill(target, value) — clear and fill input (target can be label text, placeholder, or selector)
  type(target, value) — type character by character
  press(key) — press keyboard key (e.g., "Enter", "Tab", "Escape")
  check(target) — check checkbox
  uncheck(target) — uncheck checkbox
  select(target, value) — select dropdown option
  hover(target) — mouse hover
  tap(target) — touch tap
  focus(target) — focus element
  dragTo(source, destination) — drag and drop

Waiting:
  waitForSelector(selector, options?) — wait for element (options: {state: 'visible'|'hidden', timeout: ms})
  waitForURL(pattern) — wait for URL to match
  waitForText(text) — wait for text to appear on page
  waitForLoadState(state?) — wait for 'load'|'domcontentloaded'|'networkidle'

Query (for assertions):
  innerText(selector) — get visible text of element
  textContent(selector) — get text content
  inputValue(selector) — get input value
  title() — get page title
  url() — get current URL
  content() — get page HTML
  see(text) — assert text is visible on page (throws if not found)

Other:
  screenshot() — take screenshot
  acceptDialog() — accept browser dialog
  dismissDialog() — dismiss browser dialog
  clearCookies() — clear all cookies
  evaluate(expression) — run JavaScript in browser (use sparingly, only for assertions)

RULES:
1. For "I should see X" or "X should be visible" → use see(X)
2. For URL assertions → use url() to get URL, then the runner will assert
3. For filling forms → use fill(label_or_placeholder, value)
4. For clicking → use click(visible_text_or_label). Prefer visible text.
5. For keyboard → use press(key_name)
6. target can be: visible text, label, placeholder, aria-label, CSS selector, or data-testid
7. Prefer human-readable targets (visible text) over CSS selectors
8. For compound steps, return multiple actions in order
9. For waits → add waitForSelector or waitForText after navigation/clicks if needed
10. Confidence: 1.0 for obvious steps, 0.7-0.9 for ambiguous, <0.7 for guesses
${contextBlock}
EXAMPLES:

Step: "I am on the login page"
{"actions":[{"method":"goto","args":["/login"],"description":"Navigate to login page"}],"isAssertion":false,"confidence":0.9,"explanation":"Navigate to the login page"}

Step: "I fill 'Email' with 'user@test.com'"
{"actions":[{"method":"fill","args":["Email","user@test.com"],"description":"Fill the Email field"}],"isAssertion":false,"confidence":1.0,"explanation":"Fill the Email input with the provided value"}

Step: "I click 'Sign In'"
{"actions":[{"method":"click","args":["Sign In"],"description":"Click the Sign In button"}],"isAssertion":false,"confidence":1.0,"explanation":"Click the Sign In button"}

Step: "I should see 'Welcome back'"
{"actions":[{"method":"see","args":["Welcome back"],"description":"Assert welcome text is visible"}],"isAssertion":true,"confidence":1.0,"explanation":"Verify that 'Welcome back' text is visible on the page"}

Step: "the URL should contain '/dashboard'"
{"actions":[{"method":"url","args":[],"description":"Get current URL for assertion"}],"isAssertion":true,"confidence":1.0,"explanation":"Verify the URL contains /dashboard"}

Step: "I add the first product to the cart"
{"actions":[{"method":"click","args":["Add to cart"],"description":"Click the first Add to cart button"}],"isAssertion":false,"confidence":0.8,"explanation":"Click the first 'Add to cart' button on the page"}`;
}

// ---------------------------------------------------------------------------
// AI Step Executor
// ---------------------------------------------------------------------------

export class AIStepExecutor {
	private readonly providerConfig: ProviderConfig;
	private readonly cacheSize_: number;
	private readonly aiTimeout: number;
	private readonly actionTimeout: number;
	private readonly enabled: boolean;
	private readonly debugMode: boolean;
	private readonly cache: LRUCache<string, ActionPlan>;
	private readonly systemPrompt: string;
	private readonly cachePath: string | null;
	private readonly confidenceThreshold: number;
	private readonly cacheMode: 'auto' | 'locked' | 'warm';
	private aiAvailable: boolean | null = null;
	private diskCacheLoaded = false;

	constructor(config: AIStepExecutorConfig = {}) {
		// Resolve provider config: explicit > legacy token/model > default
		this.providerConfig = config.provider ?? {
			provider: 'github-models',
			token: config.token || undefined,
			model: config.model || undefined,
		};
		this.cacheSize_ = config.cacheSize ?? 500;
		this.aiTimeout = config.aiTimeout ?? 15_000;
		this.actionTimeout = config.actionTimeout ?? 30_000;
		this.enabled = config.enabled ?? true;
		this.debugMode = config.debug ?? false;
		this.cache = new LRUCache(this.cacheSize_);
		this.systemPrompt = buildSystemPrompt(config.appContext || undefined);
		this.cachePath =
			config.cachePath !== null ? (config.cachePath ?? '.browsecraft/ai-cache.json') : null;
		this.confidenceThreshold = config.confidenceThreshold ?? 0.8;
		this.cacheMode = config.cacheMode ?? 'auto';
	}

	/** Get the provider name */
	get provider(): string {
		return this.providerConfig.provider;
	}

	/** Get the current cache mode */
	get mode(): 'auto' | 'locked' | 'warm' {
		return this.cacheMode;
	}

	/**
	 * Load persistent cache from disk. Called automatically on first step.
	 * Safe to call multiple times — only loads once.
	 */
	private async loadDiskCache(): Promise<void> {
		if (this.diskCacheLoaded || !this.cachePath) return;
		this.diskCacheLoaded = true;

		try {
			const { readFileSync } = await import('node:fs');
			const raw = readFileSync(this.cachePath, 'utf-8');
			const entries = JSON.parse(raw) as Array<{ key: string; plan: ActionPlan }>;

			if (Array.isArray(entries)) {
				for (const entry of entries) {
					if (entry.key && entry.plan) {
						this.cache.set(entry.key, entry.plan);
					}
				}
				if (this.debugMode) {
					console.log(`  [AI] Loaded ${entries.length} cached plans from ${this.cachePath}`);
				}
			}
		} catch {
			// File doesn't exist yet or is corrupt — start fresh
		}
	}

	/**
	 * Save the current cache to disk. Called after each new AI interpretation.
	 */
	private async saveDiskCache(): Promise<void> {
		if (!this.cachePath) return;

		try {
			const { mkdirSync, writeFileSync } = await import('node:fs');
			const { dirname } = await import('node:path');

			// Ensure directory exists
			mkdirSync(dirname(this.cachePath), { recursive: true });

			// Serialize the cache — only plans that meet confidence threshold
			const entries: Array<{ key: string; plan: ActionPlan }> = [];
			// Access internal map via a method on LRUCache
			for (const [key, plan] of this.cache.entries()) {
				if (plan.confidence >= this.confidenceThreshold) {
					entries.push({ key, plan });
				}
			}

			writeFileSync(this.cachePath, JSON.stringify(entries, null, 2), 'utf-8');

			if (this.debugMode) {
				console.log(`  [AI] Saved ${entries.length} plans to ${this.cachePath}`);
			}
		} catch {
			// Non-fatal — disk cache is best-effort
		}
	}

	/**
	 * Execute a Gherkin step by interpreting it with AI.
	 *
	 * @param stepText - The step text (e.g., "I click the submit button")
	 * @param keyword - The Gherkin keyword (Given/When/Then)
	 * @param page - The Browsecraft page object
	 * @returns Result of the AI step execution
	 */
	async executeStep(stepText: string, keyword: string, page: unknown): Promise<AIStepResult> {
		if (!this.enabled) {
			return {
				handled: false,
				plan: null,
				passed: false,
				cached: false,
				aiTime: 0,
				execTime: 0,
			};
		}

		// Load persistent cache on first call
		await this.loadDiskCache();

		// In locked mode we run cache-only and never need provider/network checks.
		if (this.cacheMode !== 'locked') {
			// Check AI availability (cached after first check)
			if (this.aiAvailable === null) {
				this.aiAvailable = await isProviderAvailable(this.providerConfig);
			}

			if (!this.aiAvailable) {
				const label = getProviderLabel(this.providerConfig.provider);
				return {
					handled: false,
					plan: null,
					passed: false,
					error: new Error(
						`AI step execution unavailable (${label}). Set the appropriate env var: GITHUB_TOKEN, OPENAI_API_KEY, ANTHROPIC_API_KEY, or OLLAMA_HOST.`,
					),
					cached: false,
					aiTime: 0,
					execTime: 0,
				};
			}
		}

		// 1. Check cache
		const cacheKey = normalizeForCache(stepText);
		const cachedPlan = this.cacheMode !== 'warm' ? this.cache.get(cacheKey) : undefined;

		let plan: ActionPlan;
		let aiTime = 0;
		let fromCache = false;

		if (cachedPlan) {
			plan = cachedPlan;
			fromCache = true;
			if (this.debugMode) {
				console.log(`  [AI] Cache hit: "${stepText}"`);
			}
		} else if (this.cacheMode === 'locked') {
			// Locked mode: no cache hit → can't proceed (no live AI calls)
			return {
				handled: false,
				plan: null,
				passed: false,
				error: new Error(
					`[locked mode] No cached plan for step: "${keyword} ${stepText}". Run tests in 'auto' or 'warm' mode first to populate the cache.`,
				),
				cached: false,
				aiTime: 0,
				execTime: 0,
			};
		} else {
			// 2. Ask AI to interpret the step
			const aiStart = Date.now();
			const interpreted = await this.interpretStep(stepText, keyword);
			aiTime = Date.now() - aiStart;

			if (!interpreted) {
				return {
					handled: false,
					plan: null,
					passed: false,
					error: new Error(`AI could not interpret step: "${keyword} ${stepText}"`),
					cached: false,
					aiTime,
					execTime: 0,
				};
			}

			plan = interpreted;
			this.cache.set(cacheKey, plan);

			// Persist to disk if confidence meets threshold
			if (plan.confidence >= this.confidenceThreshold) {
				await this.saveDiskCache();
			}

			if (this.debugMode) {
				const label = getProviderLabel(this.providerConfig.provider);
				console.log(
					`  [AI:${label}] Interpreted: "${stepText}" → ${plan.actions.length} action(s) (${aiTime}ms)`,
				);
				for (const action of plan.actions) {
					console.log(
						`    → ${action.method}(${action.args.map((a) => JSON.stringify(a)).join(', ')}) — ${action.description}`,
					);
				}
			}
		}

		// 3. Validate the plan
		const validationError = validatePlan(plan);
		if (validationError) {
			return {
				handled: true,
				plan,
				passed: false,
				error: new Error(`Invalid action plan: ${validationError}`),
				cached: fromCache,
				aiTime,
				execTime: 0,
			};
		}

		// 4. Execute the actions
		const execStart = Date.now();
		try {
			await this.executePlan(plan, page, stepText);
			const execTime = Date.now() - execStart;

			return {
				handled: true,
				plan,
				passed: true,
				cached: fromCache,
				aiTime,
				execTime,
			};
		} catch (err) {
			const execTime = Date.now() - execStart;
			const error = err instanceof Error ? err : new Error(String(err));

			// If execution fails, evict from cache so AI can retry with fresh context
			this.cache.delete(cacheKey);
			await this.saveDiskCache();

			return {
				handled: true,
				plan,
				passed: false,
				error,
				cached: fromCache,
				aiTime,
				execTime,
			};
		}
	}

	/**
	 * Ask the AI to interpret a step and produce an action plan.
	 */
	private async interpretStep(stepText: string, keyword: string): Promise<ActionPlan | null> {
		const messages: ChatMessage[] = [
			{ role: 'system', content: this.systemPrompt },
			{
				role: 'user',
				content: `Step: "${keyword} ${stepText}"`,
			},
		];

		try {
			const label = getProviderLabel(this.providerConfig.provider);
			const response = await withTimeout(
				providerChat(messages, this.providerConfig, {
					temperature: 0.1,
					maxTokens: 1024,
				}),
				this.aiTimeout,
				`AI interpretation timed out after ${this.aiTimeout}ms (${label})`,
			);

			if (!response) return null;

			// Parse the JSON response
			return parseActionPlan(response);
		} catch {
			return null;
		}
	}

	/**
	 * Execute an action plan against the page.
	 */
	private async executePlan(plan: ActionPlan, page: unknown, stepText: string): Promise<void> {
		const p = page as Record<string, (...args: unknown[]) => unknown>;

		for (const action of plan.actions) {
			const method = p[action.method];
			if (typeof method !== 'function') {
				throw new Error(`Page method "${action.method}" not found. Step: "${stepText}"`);
			}

			const actionCall = `${action.method}(${action.args.map((a) => JSON.stringify(a)).join(', ')})`;
			const result = method.apply(page, action.args);
			const resolvedResult = isPromiseLike(result)
				? await withTimeout(
						Promise.resolve(result),
						this.actionTimeout,
						`Action timed out after ${this.actionTimeout}ms: ${actionCall}`,
					)
				: result;

			// For assertion steps that return a value (url(), title(), innerText()),
			// we need to check the result against the step text
			if (plan.isAssertion && action.method === 'url' && resolvedResult !== undefined) {
				const urlResult = resolvedResult;
				if (typeof urlResult === 'string') {
					// Extract expected match from the step text
					const expected = extractExpectedValue(stepText);
					if (expected && !urlResult.includes(expected)) {
						throw new Error(
							`URL assertion failed: expected URL to contain "${expected}", got "${urlResult}"`,
						);
					}
				}
			}

			if (plan.isAssertion && action.method === 'title' && resolvedResult !== undefined) {
				const titleResult = resolvedResult;
				if (typeof titleResult === 'string') {
					const expected = extractExpectedValue(stepText);
					if (expected && !titleResult.includes(expected)) {
						throw new Error(
							`Title assertion failed: expected title to contain "${expected}", got "${titleResult}"`,
						);
					}
				}
			}

			if (plan.isAssertion && action.method === 'innerText' && resolvedResult !== undefined) {
				const textResult = resolvedResult;
				if (typeof textResult === 'string') {
					const expected = extractExpectedValue(stepText);
					if (expected && !textResult.includes(expected)) {
						throw new Error(
							`Text assertion failed: expected text to contain "${expected}", got "${textResult}"`,
						);
					}
				}
			}
		}
	}

	/** Get the number of cached action plans */
	get cacheSize(): number {
		return this.cache.size;
	}

	/** Clear the action plan cache */
	clearCache(): void {
		this.cache.clear();
	}

	/** Check if AI is available */
	async isAvailable(): Promise<boolean> {
		if (this.aiAvailable === null) {
			this.aiAvailable = await isProviderAvailable(this.providerConfig);
		}
		return this.aiAvailable;
	}
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate an action plan. Returns an error message or null if valid.
 */
function validatePlan(plan: ActionPlan): string | null {
	if (!plan.actions || !Array.isArray(plan.actions)) {
		return 'Action plan must have an actions array';
	}

	if (plan.actions.length === 0) {
		return 'Action plan must have at least one action';
	}

	for (let i = 0; i < plan.actions.length; i++) {
		const action = plan.actions[i]!;

		if (!action.method || typeof action.method !== 'string') {
			return `Action ${i} must have a method string`;
		}

		if (!ALLOWED_METHODS.has(action.method as AllowedMethod)) {
			return `Action ${i} uses disallowed method "${action.method}". Allowed: ${[...ALLOWED_METHODS].join(', ')}`;
		}

		if (action.method === 'evaluate' && !plan.isAssertion) {
			return `Action ${i} uses "evaluate", which is only allowed for assertion steps`;
		}

		if (!Array.isArray(action.args)) {
			return `Action ${i} must have an args array`;
		}

		// Validate args are safe types (no functions, no symbols)
		for (let j = 0; j < action.args.length; j++) {
			const arg = action.args[j];
			const argType = typeof arg;
			if (argType === 'function' || argType === 'symbol' || argType === 'bigint') {
				return `Action ${i}, arg ${j} has unsafe type "${argType}"`;
			}
		}
	}

	if (typeof plan.confidence !== 'number' || plan.confidence < 0 || plan.confidence > 1) {
		// Auto-fix missing confidence
		plan.confidence = 0.5;
	}

	return null;
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

/**
 * Parse the AI response into an ActionPlan.
 * Handles common AI response quirks (markdown fences, extra text, etc.)
 */
function parseActionPlan(response: string): ActionPlan | null {
	let cleaned = response.trim();

	// Strip markdown code fences if present
	if (cleaned.startsWith('```')) {
		cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
	}

	// Try to find JSON object in the response
	const jsonStart = cleaned.indexOf('{');
	const jsonEnd = cleaned.lastIndexOf('}');

	if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
		return null;
	}

	cleaned = cleaned.slice(jsonStart, jsonEnd + 1);

	try {
		const parsed = JSON.parse(cleaned) as ActionPlan;

		// Validate basic structure
		if (!parsed.actions || !Array.isArray(parsed.actions)) {
			return null;
		}

		// Ensure all required fields
		return {
			actions: parsed.actions.map((a) => ({
				method: String(a.method) as AllowedMethod,
				args: Array.isArray(a.args) ? a.args : [],
				description: String(a.description ?? ''),
			})),
			isAssertion: Boolean(parsed.isAssertion),
			confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
			explanation: String(parsed.explanation ?? ''),
		};
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract an expected value from step text.
 * Looks for quoted strings or common patterns.
 */
function extractExpectedValue(stepText: string): string | null {
	// Match quoted strings
	const doubleQuoted = stepText.match(/"([^"]+)"/);
	if (doubleQuoted?.[1]) return doubleQuoted[1];

	const singleQuoted = stepText.match(/'([^']+)'/);
	if (singleQuoted?.[1]) return singleQuoted[1];

	// Match "contain X" or "contains X"
	const containMatch = stepText.match(/contains?\s+(.+)$/i);
	if (containMatch?.[1]) return containMatch[1].trim();

	// Match "be X" or "is X"
	const beMatch = stepText.match(/(?:should\s+)?be\s+"?([^"]+)"?$/i);
	if (beMatch?.[1]) return beMatch[1].trim();

	return null;
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

/**
 * Create an AI step executor with explicit config.
 *
 * ```ts
 * const aiExecutor = createAIStepExecutor({
 *   provider: { provider: 'openai', token: process.env.OPENAI_API_KEY },
 *   debug: true,
 * });
 * ```
 */
export function createAIStepExecutor(config?: AIStepExecutorConfig): AIStepExecutor {
	return new AIStepExecutor(config);
}

/**
 * User-facing AI config shape — matches the `ai` field in browsecraft.config.ts.
 * This is intentionally a minimal type so this module doesn't import from the
 * `browsecraft` package (which would create a circular dependency).
 */
export interface SimpleAIConfig {
	provider: string;
	model?: string;
	token?: string;
	apiKey?: string;
	baseUrl?: string;
}

/**
 * Create an AI step executor from the user-facing config (`ai` field).
 *
 * This is the "one-liner" factory that the framework calls internally.
 * Users configure AI in their config file and the framework does the rest.
 *
 * ```ts
 * // In browsecraft.config.ts:
 * export default defineConfig({ ai: 'auto' });
 *
 * // The framework internally calls:
 * const executor = createAIStepExecutorFromConfig(resolvedAIConfig);
 * ```
 *
 * @param aiConfig - The resolved AI config (from resolveAIConfig)
 * @param options  - Extra options (debug, appContext, etc.)
 * @returns An AIStepExecutor, or null if the config is null/off
 */
export function createAIStepExecutorFromConfig(
	aiConfig: SimpleAIConfig | null,
	options?: {
		debug?: boolean;
		appContext?: string;
		cacheSize?: number;
		cachePath?: string | null;
		confidenceThreshold?: number;
		cacheMode?: 'auto' | 'locked' | 'warm';
		aiTimeout?: number;
		actionTimeout?: number;
	},
): AIStepExecutor | null {
	if (!aiConfig) return null;

	const provider = aiConfig.provider as ProviderConfig['provider'];

	const providerConfig: ProviderConfig = {
		provider,
		model: aiConfig.model,
		token: aiConfig.token || aiConfig.apiKey || undefined,
		baseUrl: aiConfig.baseUrl,
	};

	return new AIStepExecutor({
		provider: providerConfig,
		enabled: true,
		debug: options?.debug ?? false,
		appContext: options?.appContext ?? '',
		cacheSize: options?.cacheSize ?? 500,
		cachePath: options?.cachePath,
		confidenceThreshold: options?.confidenceThreshold,
		cacheMode: options?.cacheMode,
		aiTimeout: options?.aiTimeout,
		actionTimeout: options?.actionTimeout,
	});
}
