// ============================================================================
// Browsecraft - Page API
// The main class users interact with. Designed to be dead simple.
//
// page.goto('https://example.com')
// page.click('Submit')
// page.fill('Email', 'user@test.com')
// ============================================================================

import type {
	BiDiSession,
	BrowsingContextCaptureScreenshotParams,
	NetworkSetCookieHeader,
	NodeRemoteValue,
	PointerAction,
	ScriptEvaluateResult,
	SharedReference,
	StorageCookie,
} from 'browsecraft-bidi';
import type { BrowsecraftConfig } from './config.js';
import { resolveAIConfig } from './config.js';
import { ElementNotActionableError, ElementNotFoundError } from './errors.js';
import {
	type ElementTarget,
	type LocatedElement,
	locateAllElements,
	locateElement,
} from './locator.js';
import {
	type ActionabilityResult,
	type WaitOptions,
	waitFor,
	waitForActionable,
	waitForLoadState,
} from './wait.js';

/** Options for page.goto() */
export interface GotoOptions {
	/** Wait until page reaches this state (default: 'complete') */
	waitUntil?: 'none' | 'interactive' | 'complete';
	/** Timeout in ms (default: config.timeout) */
	timeout?: number;
}

/** Options for page.fill() */
export interface FillOptions {
	/** Timeout in ms (default: config.timeout) */
	timeout?: number;
}

/** Options for page.click() */
export interface ClickOptions {
	/** Timeout in ms (default: config.timeout) */
	timeout?: number;
	/** Mouse button (default: 0 = left) */
	button?: number;
	/** Number of clicks (default: 1, use 2 for double-click) */
	clickCount?: number;
}

/** Mock response definition */
export interface MockResponse {
	/** HTTP status code */
	status?: number;
	/** Response headers */
	headers?: Record<string, string>;
	/** Response body (string or object that will be JSON-stringified) */
	body?: string | Record<string, unknown>;
	/** Content type (default: 'application/json' for objects, 'text/plain' for strings) */
	contentType?: string;
}

/** Request info passed to intercept handlers */
export interface InterceptedRequest {
	/** The full URL of the request */
	url: string;
	/** HTTP method (GET, POST, etc.) */
	method: string;
	/** Request headers */
	headers: Record<string, string>;
}

/**
 * Page represents a single browser tab/page.
 * This is the main API surface users interact with.
 *
 * Every action auto-waits for the element to be ready.
 * No sleep(). No waitFor(). It just works.
 */
export class Page {
	/** @internal */
	readonly session: BiDiSession;
	/** @internal */
	readonly contextId: string;
	/** @internal */
	private config: BrowsecraftConfig;
	/** @internal */
	private interceptIds: string[] = [];
	/** @internal -- event listener unsubscribe functions for cleanup */
	private eventCleanups: Array<() => void> = [];
	/** @internal -- adaptive timing: multiplier derived from environment speed */
	private timingMultiplier = 1.0;
	/** @internal -- whether timing has been calibrated */
	private timingCalibrated = false;

	constructor(session: BiDiSession, contextId: string, config: BrowsecraftConfig) {
		this.session = session;
		this.contextId = contextId;
		this.config = config;
	}

	// -----------------------------------------------------------------------
	// Navigation
	// -----------------------------------------------------------------------

	/**
	 * Navigate to a URL.
	 *
	 * ```ts
	 * await page.goto('https://example.com');
	 * await page.goto('/login');  // uses baseURL from config
	 * ```
	 */
	async goto(url: string, options?: GotoOptions): Promise<void> {
		const fullUrl = this.resolveURL(url);
		const waitUntil = options?.waitUntil ?? 'complete';

		const navStart = Date.now();
		await this.session.browsingContext.navigate({
			context: this.contextId,
			url: fullUrl,
			wait: waitUntil,
		});

		// Calibrate adaptive timing on first navigation.
		// Fast machine (200ms load) → multiplier stays 1.0
		// Slow CI VM (3s load)      → multiplier ~2.5, giving actions more time
		if (!this.timingCalibrated) {
			this.timingCalibrated = true;
			const elapsed = Date.now() - navStart;
			// 800ms baseline. Clamp between 1.0 (never reduce) and 5.0 (cap)
			this.timingMultiplier = Math.max(1.0, Math.min(5.0, elapsed / 800));
		}
	}

	/**
	 * Reload the current page.
	 */
	async reload(options?: GotoOptions): Promise<void> {
		await this.session.browsingContext.reload({
			context: this.contextId,
			wait: options?.waitUntil ?? 'complete',
		});
	}

	/**
	 * Go back in browser history.
	 */
	async goBack(): Promise<void> {
		await this.session.browsingContext.traverseHistory({
			context: this.contextId,
			delta: -1,
		});
	}

	/**
	 * Go forward in browser history.
	 */
	async goForward(): Promise<void> {
		await this.session.browsingContext.traverseHistory({
			context: this.contextId,
			delta: 1,
		});
	}

	// -----------------------------------------------------------------------
	// Element interaction - the "stupidly simple" API
	// -----------------------------------------------------------------------

	/**
	 * Click an element. Finds it by text, role, or selector -- auto-waits.
	 *
	 * ```ts
	 * await page.click('Submit');                           // by text
	 * await page.click({ role: 'button', name: 'Submit' }); // precise
	 * await page.click({ selector: '#my-button' });          // CSS
	 * ```
	 */
	async click(target: ElementTarget, options?: ClickOptions): Promise<void> {
		const timeout = options?.timeout ?? this.config.timeout;
		const located = await this.locateWithHealing(target, 'click', { timeout });

		await this.ensureActionable(located, 'click', target, { timeout });
		await this.scrollIntoViewAndClick(located, options);
	}

	/**
	 * Fill a text input. First arg finds the input, second is the value.
	 *
	 * ```ts
	 * await page.fill('Email', 'user@test.com');       // by label
	 * await page.fill('Search', 'browsecraft');          // by placeholder
	 * await page.fill({ selector: '#email' }, 'test');   // by CSS
	 * ```
	 */
	async fill(target: ElementTarget, value: string, options?: FillOptions): Promise<void> {
		const timeout = options?.timeout ?? this.config.timeout;

		// For string targets, resolve as a form input label/placeholder/accessible-name.
		// Using only { label } avoids the generic innerText strategy which can match
		// non-input elements (e.g. headings containing the word "Username").
		const resolvedTarget: ElementTarget = typeof target === 'string' ? { label: target } : target;

		const located = await this.locateWithHealing(resolvedTarget, 'fill', { timeout });

		await this.ensureActionable(located, 'fill', target, { timeout });

		// Clear existing value and type new one
		const ref = this.getSharedRef(located.node);
		await this.session.script.callFunction({
			functionDeclaration: `function(element, value) {
				element.focus();
				// Use native setter to bypass React/Vue/Angular internal value trackers.
				// Frameworks like React override the value property on input elements,
				// so setting element.value directly doesn't trigger their state updates.
				const proto = element.tagName === 'TEXTAREA'
					? HTMLTextAreaElement.prototype
					: HTMLInputElement.prototype;
				const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
				if (nativeSetter) {
					nativeSetter.call(element, '');
					nativeSetter.call(element, value);
				} else {
					element.value = '';
					element.value = value;
				}
				element.dispatchEvent(new Event('input', { bubbles: true }));
				element.dispatchEvent(new Event('change', { bubbles: true }));
			}`,
			target: { context: this.contextId },
			arguments: [ref, { type: 'string', value }],
			awaitPromise: false,
		});
	}

	/**
	 * Type text character by character (triggers keyboard events).
	 * Use this instead of fill() when you need realistic keyboard input.
	 *
	 * ```ts
	 * await page.type('Search', 'browsecraft');
	 * ```
	 */
	async type(target: ElementTarget, text: string, options?: FillOptions): Promise<void> {
		const timeout = options?.timeout ?? this.config.timeout;

		// For string targets, resolve as a form input label/placeholder/accessible-name.
		// Using only { label } avoids innerText matching non-input elements.
		const resolvedTarget: ElementTarget = typeof target === 'string' ? { label: target } : target;

		const located = await this.locateWithHealing(resolvedTarget, 'type', { timeout });

		await this.ensureActionable(located, 'type', target, { timeout });

		// Focus the element first
		const ref = this.getSharedRef(located.node);
		await this.session.script.callFunction({
			functionDeclaration: 'function(el) { el.focus(); }',
			target: { context: this.contextId },
			arguments: [ref],
			awaitPromise: false,
		});

		// Type each character
		const actions = [];
		for (const char of text) {
			actions.push({ type: 'keyDown' as const, value: char });
			actions.push({ type: 'keyUp' as const, value: char });
		}

		await this.session.input.performActions({
			context: this.contextId,
			actions: [{ type: 'key', id: 'keyboard', actions }],
		});
	}

	/**
	 * Select an option from a <select> dropdown.
	 *
	 * ```ts
	 * await page.select('Country', 'United States');
	 * ```
	 */
	async select(target: ElementTarget, value: string, options?: FillOptions): Promise<void> {
		const timeout = options?.timeout ?? this.config.timeout;
		const resolvedTarget: ElementTarget = typeof target === 'string' ? { label: target } : target;

		const located = await this.locateWithHealing(resolvedTarget, 'select', { timeout });

		await this.ensureActionable(located, 'select', target, { timeout });

		const ref = this.getSharedRef(located.node);

		await this.session.script.callFunction({
			functionDeclaration: `function(element, value) {
				const options = Array.from(element.options);
				const option = options.find(o => o.value === value || o.text === value || o.textContent.trim() === value);
				if (option) {
					element.value = option.value;
					element.dispatchEvent(new Event('change', { bubbles: true }));
				} else {
					throw new Error('Option "' + value + '" not found in <select>');
				}
			}`,
			target: { context: this.contextId },
			arguments: [ref, { type: 'string', value }],
			awaitPromise: false,
		});
	}

	/**
	 * Check a checkbox or radio button.
	 *
	 * ```ts
	 * await page.check('I agree to the terms');
	 * ```
	 */
	async check(target: ElementTarget, options?: ClickOptions): Promise<void> {
		const timeout = options?.timeout ?? this.config.timeout;
		const located = await this.locateWithHealing(target, 'check', { timeout });

		await this.ensureActionable(located, 'check', target, { timeout });

		const ref = this.getSharedRef(located.node);

		// Only click if not already checked
		const result = await this.session.script.callFunction({
			functionDeclaration: 'function(el) { return el.checked; }',
			target: { context: this.contextId },
			arguments: [ref],
			awaitPromise: false,
		});

		const isChecked =
			result.type === 'success' &&
			result.result?.type === 'boolean' &&
			(result.result as { value: boolean }).value === true;

		if (!isChecked) {
			await this.scrollIntoViewAndClick(located, options);
		}
	}

	/**
	 * Uncheck a checkbox.
	 */
	async uncheck(target: ElementTarget, options?: ClickOptions): Promise<void> {
		const timeout = options?.timeout ?? this.config.timeout;
		const located = await this.locateWithHealing(target, 'uncheck', { timeout });

		await this.ensureActionable(located, 'uncheck', target, { timeout });

		const ref = this.getSharedRef(located.node);

		const result = await this.session.script.callFunction({
			functionDeclaration: 'function(el) { return el.checked; }',
			target: { context: this.contextId },
			arguments: [ref],
			awaitPromise: false,
		});

		const isChecked =
			result.type === 'success' &&
			result.result?.type === 'boolean' &&
			(result.result as { value: boolean }).value === true;

		if (isChecked) {
			await this.scrollIntoViewAndClick(located, options);
		}
	}

	/**
	 * Hover over an element.
	 *
	 * ```ts
	 * await page.hover('Profile Menu');
	 * ```
	 */
	async hover(target: ElementTarget, options?: { timeout?: number }): Promise<void> {
		const timeout = options?.timeout ?? this.config.timeout;
		const located = await this.locateWithHealing(target, 'hover', { timeout });

		await this.ensureActionable(located, 'hover', target, { timeout });

		const ref = this.getSharedRef(located.node);

		// Scroll into view first so coordinates are accurate
		await this.session.script.callFunction({
			functionDeclaration:
				'function(el) { el.scrollIntoView({ block: "center", behavior: "instant" }); }',
			target: { context: this.contextId },
			arguments: [ref],
			awaitPromise: false,
		});

		// Dispatch mouseover/mouseenter events via JS for reliability,
		// then also move the real pointer for CSS :hover effects
		await this.session.script.callFunction({
			functionDeclaration: `function(el) {
				el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
				el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
			}`,
			target: { context: this.contextId },
			arguments: [ref],
			awaitPromise: false,
		});

		// Also move the real pointer (needed for CSS :hover pseudo-class)
		const pos = await this.getElementCenter(ref);
		await this.session.input.performActions({
			context: this.contextId,
			actions: [
				{
					type: 'pointer',
					id: 'mouse',
					parameters: { pointerType: 'mouse' },
					actions: [{ type: 'pointerMove', x: pos.x, y: pos.y, origin: 'viewport' }],
				},
			],
		});
	}

	// -----------------------------------------------------------------------
	// Finding elements (for assertions and inspection)
	// -----------------------------------------------------------------------

	/**
	 * Get a single element. Returns an ElementHandle for assertions.
	 *
	 * ```ts
	 * const heading = page.get('Welcome back!');
	 * await expect(heading).toBeVisible();
	 * ```
	 */
	get(target: ElementTarget): ElementHandle {
		return new ElementHandle(this, target);
	}

	/**
	 * Get a locator by visible text. Alias for get() with text matching.
	 *
	 * ```ts
	 * const btn = page.getByText('Submit');
	 * ```
	 */
	getByText(text: string, options?: { exact?: boolean }): ElementHandle {
		return new ElementHandle(this, { text, exact: options?.exact });
	}

	/**
	 * Get a locator by ARIA role and optional name.
	 *
	 * ```ts
	 * const btn = page.getByRole('button', { name: 'Submit' });
	 * ```
	 */
	getByRole(role: string, options?: { name?: string; exact?: boolean }): ElementHandle {
		return new ElementHandle(this, { role, name: options?.name, exact: options?.exact });
	}

	/**
	 * Get a locator by label text (for form inputs).
	 *
	 * ```ts
	 * const email = page.getByLabel('Email Address');
	 * ```
	 */
	getByLabel(label: string, options?: { exact?: boolean }): ElementHandle {
		return new ElementHandle(this, { label, exact: options?.exact });
	}

	/**
	 * Get a locator by data-testid attribute.
	 *
	 * ```ts
	 * const card = page.getByTestId('user-card');
	 * ```
	 */
	getByTestId(testId: string): ElementHandle {
		return new ElementHandle(this, { testId });
	}

	// -----------------------------------------------------------------------
	// Page state
	// -----------------------------------------------------------------------

	/**
	 * Get the current page URL.
	 *
	 * Resilient to transient "Cannot find context" errors that occur briefly
	 * during cross-origin navigations (e.g., clicking a link from example.com
	 * to iana.org). Retries for up to 5 seconds before giving up.
	 */
	async url(): Promise<string> {
		return this.evaluateWithNavRetry('window.location.href');
	}

	/**
	 * Get the page title.
	 *
	 * Resilient to transient context errors during cross-origin navigation.
	 */
	async title(): Promise<string> {
		return this.evaluateWithNavRetry('document.title');
	}

	/**
	 * Get the full page HTML content.
	 *
	 * Resilient to transient context errors during cross-origin navigation.
	 */
	async content(): Promise<string> {
		return this.evaluateWithNavRetry('document.documentElement.outerHTML');
	}

	// -----------------------------------------------------------------------
	// Cookies
	// -----------------------------------------------------------------------

	/**
	 * Get cookies for the current page's browsing context.
	 *
	 * ```ts
	 * const cookies = await page.cookies();
	 * const session = cookies.find(c => c.name === 'session_id');
	 * ```
	 */
	async cookies(filter?: { name?: string; domain?: string; path?: string }): Promise<
		StorageCookie[]
	> {
		const result = await this.session.storage.getCookies({
			filter: filter
				? {
						name: filter.name,
						domain: filter.domain,
						path: filter.path,
					}
				: undefined,
			partition: { type: 'context', context: this.contextId },
		});
		return result.cookies;
	}

	/**
	 * Set one or more cookies.
	 *
	 * ```ts
	 * await page.setCookies([
	 *   { name: 'token', value: 'abc123', domain: 'example.com' },
	 *   { name: 'theme', value: 'dark', domain: 'example.com' },
	 * ]);
	 * ```
	 */
	async setCookies(
		cookies: Array<{
			name: string;
			value: string;
			domain?: string;
			path?: string;
			httpOnly?: boolean;
			secure?: boolean;
			sameSite?: 'strict' | 'lax' | 'none';
			expiry?: number;
		}>,
	): Promise<void> {
		for (const cookie of cookies) {
			const cookieHeader: NetworkSetCookieHeader = {
				name: cookie.name,
				value: { type: 'string', value: cookie.value },
				domain: cookie.domain,
				path: cookie.path,
				httpOnly: cookie.httpOnly,
				secure: cookie.secure,
				sameSite: cookie.sameSite,
				expiry: cookie.expiry,
			};
			await this.session.storage.setCookie({
				cookie: cookieHeader,
				partition: { type: 'context', context: this.contextId },
			});
		}
	}

	/**
	 * Clear all cookies (or those matching a filter).
	 *
	 * ```ts
	 * await page.clearCookies();                           // all cookies
	 * await page.clearCookies({ name: 'session_id' });     // specific cookie
	 * await page.clearCookies({ domain: 'example.com' });  // by domain
	 * ```
	 */
	async clearCookies(filter?: { name?: string; domain?: string; path?: string }): Promise<void> {
		await this.session.storage.deleteCookies({
			filter: filter
				? {
						name: filter.name,
						domain: filter.domain,
						path: filter.path,
					}
				: undefined,
			partition: { type: 'context', context: this.contextId },
		});
	}

	// -----------------------------------------------------------------------
	// JavaScript execution
	// -----------------------------------------------------------------------

	/**
	 * Execute JavaScript in the page and return the result.
	 *
	 * ```ts
	 * const title = await page.evaluate('document.title');
	 * const count = await page.evaluate(() => document.querySelectorAll('li').length);
	 * ```
	 */
	async evaluate<T = unknown>(expression: string | (() => T)): Promise<T> {
		const expr = typeof expression === 'function' ? `(${expression.toString()})()` : expression;

		const result = await this.session.script.evaluate({
			expression: expr,
			target: { context: this.contextId },
			awaitPromise: true,
		});

		if (result.type === 'exception') {
			const errorText = result.exceptionDetails?.text ?? 'Script evaluation failed';
			throw new Error(errorText);
		}

		return this.deserializeRemoteValue(result.result) as T;
	}

	// -----------------------------------------------------------------------
	// Screenshots
	// -----------------------------------------------------------------------

	/**
	 * Take a screenshot of the page.
	 *
	 * ```ts
	 * const buffer = await page.screenshot();
	 * ```
	 */
	async screenshot(): Promise<Buffer> {
		const result = await this.session.browsingContext.captureScreenshot({
			context: this.contextId,
		});

		return Buffer.from(result.data, 'base64');
	}

	// -----------------------------------------------------------------------
	// Network mocking
	// -----------------------------------------------------------------------

	/**
	 * Mock a network request with a fake response.
	 *
	 * ```ts
	 * await page.mock('POST /api/login', { status: 200, body: { token: 'abc' } });
	 * await page.mock('GET /api/users', { status: 500 });
	 * await page.mock('https://api.example.com/data', { body: { items: [] } });
	 * ```
	 */
	async mock(pattern: string, response: MockResponse): Promise<void> {
		// Parse "METHOD /path" or just "/path" or full URL
		const { method, urlPattern } = parseMockPattern(pattern);

		// Subscribe to network events if not already
		await this.session.subscribe(['network.beforeRequestSent'], [this.contextId]);

		// Add intercept
		const result = await this.session.network.addIntercept({
			phases: ['beforeRequestSent'],
			urlPatterns: [urlPattern],
			contexts: [this.contextId],
		});
		this.interceptIds.push(result.intercept);

		// Handle intercepted requests
		const unsubscribe = this.session.on('network.beforeRequestSent', async (event) => {
			const params = event.params as {
				context: string;
				request: { request: string; method: string };
				isBlocked: boolean;
				intercepts?: string[];
			};

			if (!params.isBlocked || params.context !== this.contextId) return;
			if (!params.intercepts?.includes(result.intercept)) return;

			// Check method if specified
			if (method && params.request.method.toUpperCase() !== method.toUpperCase()) {
				await this.session.network.continueRequest({ request: params.request.request });
				return;
			}

			// Provide the mock response
			const headers = buildMockHeaders(response);
			const body = buildMockBody(response);

			await this.session.network.provideResponse({
				request: params.request.request,
				statusCode: response.status ?? 200,
				headers,
				body: body ? { type: 'string', value: body } : undefined,
			});
		});
		this.eventCleanups.push(unsubscribe);
	}

	/**
	 * Remove all network mocks and clean up event listeners.
	 */
	async clearMocks(): Promise<void> {
		for (const id of this.interceptIds) {
			await this.session.network.removeIntercept({ intercept: id }).catch(() => {});
		}
		this.interceptIds = [];

		for (const cleanup of this.eventCleanups) {
			cleanup();
		}
		this.eventCleanups = [];
	}

	// -----------------------------------------------------------------------
	// Dialog handling
	// -----------------------------------------------------------------------

	/**
	 * Accept the next dialog (alert, confirm, prompt).
	 *
	 * ```ts
	 * await page.acceptDialog();
	 * page.click('Delete'); // triggers confirm dialog
	 * ```
	 */
	async acceptDialog(text?: string): Promise<void> {
		await this.session.subscribe(['browsingContext.userPromptOpened'], [this.contextId]);

		await this.session.waitForEvent(
			'browsingContext.userPromptOpened',
			(e) => (e.params as { context: string }).context === this.contextId,
		);

		await this.session.browsingContext.handleUserPrompt({
			context: this.contextId,
			accept: true,
			userText: text,
		});
	}

	/**
	 * Dismiss the next dialog.
	 */
	async dismissDialog(): Promise<void> {
		await this.session.subscribe(['browsingContext.userPromptOpened'], [this.contextId]);

		await this.session.waitForEvent(
			'browsingContext.userPromptOpened',
			(e) => (e.params as { context: string }).context === this.contextId,
		);

		await this.session.browsingContext.handleUserPrompt({
			context: this.contextId,
			accept: false,
		});
	}

	/**
	 * Double-click an element.
	 *
	 * ```ts
	 * await page.dblclick('Edit');
	 * ```
	 */
	async dblclick(target: ElementTarget, options?: ClickOptions): Promise<void> {
		await this.click(target, { ...options, clickCount: 2 });
	}

	/**
	 * Tap an element (touch gesture).
	 *
	 * ```ts
	 * await page.tap('Menu');
	 * ```
	 */
	async tap(target: ElementTarget, options?: { timeout?: number }): Promise<void> {
		const timeout = options?.timeout ?? this.config.timeout;
		const located = await this.locateWithHealing(target, 'tap', { timeout });

		await this.ensureActionable(located, 'tap', target, { timeout });

		const ref = this.getSharedRef(located.node);

		// Scroll into view
		await this.session.script.callFunction({
			functionDeclaration:
				'function(el) { el.scrollIntoView({ block: "center", behavior: "instant" }); }',
			target: { context: this.contextId },
			arguments: [ref],
			awaitPromise: false,
		});

		const pos = await this.getElementCenter(ref);

		await this.session.input.performActions({
			context: this.contextId,
			actions: [
				{
					type: 'pointer',
					id: 'touch',
					parameters: { pointerType: 'touch' },
					actions: [
						{ type: 'pointerMove', x: pos.x, y: pos.y, origin: 'viewport' },
						{ type: 'pointerDown', button: 0 },
						{ type: 'pointerUp', button: 0 },
					] satisfies PointerAction[],
				},
			],
		});
	}

	/**
	 * Focus an element.
	 *
	 * ```ts
	 * await page.focus('Email');
	 * ```
	 */
	async focus(target: ElementTarget, options?: { timeout?: number }): Promise<void> {
		const timeout = options?.timeout ?? this.config.timeout;
		const resolvedTarget: ElementTarget = typeof target === 'string' ? { label: target } : target;
		const located = await this.locateWithHealing(resolvedTarget, 'focus', { timeout });

		await this.ensureActionable(located, 'focus', target, { timeout, enabled: false });

		const ref = this.getSharedRef(located.node);

		await this.session.script.callFunction({
			functionDeclaration: 'function(el) { el.focus(); }',
			target: { context: this.contextId },
			arguments: [ref],
			awaitPromise: false,
		});
	}

	/**
	 * Remove focus from an element.
	 *
	 * ```ts
	 * await page.blur('Email');
	 * ```
	 */
	async blur(target: ElementTarget, options?: { timeout?: number }): Promise<void> {
		const timeout = options?.timeout ?? this.config.timeout;
		const resolvedTarget: ElementTarget = typeof target === 'string' ? { label: target } : target;
		const located = await this.locateWithHealing(resolvedTarget, 'blur', { timeout });
		const ref = this.getSharedRef(located.node);

		await this.session.script.callFunction({
			functionDeclaration: 'function(el) { el.blur(); }',
			target: { context: this.contextId },
			arguments: [ref],
			awaitPromise: false,
		});
	}

	/**
	 * Get the visible inner text of an element (like element.innerText).
	 *
	 * ```ts
	 * const text = await page.innerText('h1');
	 * ```
	 */
	async innerText(target: ElementTarget, options?: { timeout?: number }): Promise<string> {
		const timeout = options?.timeout ?? this.config.timeout;
		const located = await this.locateWithHealing(target, 'innerText', { timeout });
		const ref = this.getSharedRef(located.node);

		const result = await this.session.script.callFunction({
			functionDeclaration: 'function(el) { return el.innerText || ""; }',
			target: { context: this.contextId },
			arguments: [ref],
			awaitPromise: false,
		});

		return this.extractStringResult(result) ?? '';
	}

	/**
	 * Get the innerHTML of an element.
	 *
	 * ```ts
	 * const html = await page.innerHTML('.container');
	 * ```
	 */
	async innerHTML(target: ElementTarget, options?: { timeout?: number }): Promise<string> {
		const timeout = options?.timeout ?? this.config.timeout;
		const located = await this.locateWithHealing(target, 'innerHTML', { timeout });
		const ref = this.getSharedRef(located.node);

		const result = await this.session.script.callFunction({
			functionDeclaration: 'function(el) { return el.innerHTML || ""; }',
			target: { context: this.contextId },
			arguments: [ref],
			awaitPromise: false,
		});

		return this.extractStringResult(result) ?? '';
	}

	/**
	 * Get the current value of an input/textarea/select.
	 *
	 * ```ts
	 * const email = await page.inputValue('Email');
	 * ```
	 */
	async inputValue(target: ElementTarget, options?: { timeout?: number }): Promise<string> {
		const timeout = options?.timeout ?? this.config.timeout;
		const resolvedTarget: ElementTarget = typeof target === 'string' ? { label: target } : target;
		const located = await this.locateWithHealing(resolvedTarget, 'inputValue', { timeout });
		const ref = this.getSharedRef(located.node);

		const result = await this.session.script.callFunction({
			functionDeclaration: 'function(el) { return el.value ?? ""; }',
			target: { context: this.contextId },
			arguments: [ref],
			awaitPromise: false,
		});

		return this.extractStringResult(result) ?? '';
	}

	/**
	 * Select multiple options from a <select multiple> dropdown.
	 *
	 * ```ts
	 * await page.selectOption('Colors', ['red', 'blue']);
	 * ```
	 */
	async selectOption(
		target: ElementTarget,
		values: string | string[],
		options?: FillOptions,
	): Promise<void> {
		const timeout = options?.timeout ?? this.config.timeout;
		const resolvedTarget: ElementTarget = typeof target === 'string' ? { label: target } : target;
		const located = await this.locateWithHealing(resolvedTarget, 'selectOption', { timeout });

		await this.ensureActionable(located, 'selectOption', target, { timeout });

		const ref = this.getSharedRef(located.node);
		const valuesArray = Array.isArray(values) ? values : [values];

		await this.session.script.callFunction({
			functionDeclaration: `function(element, values) {
				const opts = Array.from(element.options);
				for (const opt of opts) {
					opt.selected = values.some(v => opt.value === v || opt.text === v || opt.textContent.trim() === v);
				}
				element.dispatchEvent(new Event('change', { bubbles: true }));
			}`,
			target: { context: this.contextId },
			arguments: [
				ref,
				{ type: 'array', value: valuesArray.map((v) => ({ type: 'string' as const, value: v })) },
			],
			awaitPromise: false,
		});
	}

	/**
	 * Drag an element to another element or position.
	 *
	 * ```ts
	 * await page.dragTo('Draggable', 'Drop Zone');
	 * ```
	 */
	async dragTo(
		source: ElementTarget,
		dest: ElementTarget,
		options?: { timeout?: number },
	): Promise<void> {
		const timeout = options?.timeout ?? this.config.timeout;

		const sourceLoc = await locateElement(this.session, this.contextId, source, { timeout });
		const sourceRef = this.getSharedRef(sourceLoc.node);
		const sourcePos = await this.getElementCenter(sourceRef);

		const destLoc = await locateElement(this.session, this.contextId, dest, { timeout });
		const destRef = this.getSharedRef(destLoc.node);
		const destPos = await this.getElementCenter(destRef);

		await this.session.input.performActions({
			context: this.contextId,
			actions: [
				{
					type: 'pointer',
					id: 'mouse',
					parameters: { pointerType: 'mouse' },
					actions: [
						{ type: 'pointerMove', x: sourcePos.x, y: sourcePos.y, origin: 'viewport' },
						{ type: 'pointerDown', button: 0 },
						{ type: 'pointerMove', x: destPos.x, y: destPos.y, origin: 'viewport', duration: 300 },
						{ type: 'pointerUp', button: 0 },
					] satisfies PointerAction[],
				},
			],
		});
	}

	// -----------------------------------------------------------------------
	// Waiting (explicit -- but usually you don't need these)
	// -----------------------------------------------------------------------

	/**
	 * Wait for an element matching the target to appear in the DOM.
	 *
	 * ```ts
	 * await page.waitForSelector('.loaded');
	 * await page.waitForSelector({ role: 'dialog' });
	 * ```
	 */
	async waitForSelector(
		target: ElementTarget,
		options?: { timeout?: number; state?: 'attached' | 'visible' | 'hidden' },
	): Promise<ElementHandle> {
		const timeout = this.adaptTimeout(options?.timeout ?? this.config.timeout);
		const state = options?.state ?? 'visible';

		if (state === 'hidden') {
			// Wait for the element to disappear
			await waitFor(
				'element to be hidden',
				async () => {
					try {
						const elements = await locateAllElements(this.session, this.contextId, target);
						if (elements.length === 0) return true;

						// Check visibility
						const ref = this.getSharedRef(elements[0]!.node);
						const result = await this.session.script.callFunction({
							functionDeclaration: `function(el) {
								const style = window.getComputedStyle(el);
								return style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0';
							}`,
							target: { context: this.contextId },
							arguments: [ref],
							awaitPromise: false,
						});
						const isHidden =
							result.type === 'success' &&
							result.result?.type === 'boolean' &&
							(result.result as { value: boolean }).value === true;
						return isHidden ? true : null;
					} catch {
						return true; // Element gone = hidden
					}
				},
				{ timeout },
			);
			return new ElementHandle(this, target);
		}

		// Wait for element to appear
		const located = await locateElement(this.session, this.contextId, target, { timeout });

		if (state === 'visible') {
			// Also verify it's visible
			const ref = this.getSharedRef(located.node);
			await waitFor(
				'element to be visible',
				async () => {
					const result = await this.session.script.callFunction({
						functionDeclaration: `function(el) {
							const style = window.getComputedStyle(el);
							const rect = el.getBoundingClientRect();
							return style.display !== 'none' && style.visibility !== 'hidden' &&
								style.opacity !== '0' && rect.width > 0 && rect.height > 0;
						}`,
						target: { context: this.contextId },
						arguments: [ref],
						awaitPromise: false,
					});
					const isVisible =
						result.type === 'success' &&
						result.result?.type === 'boolean' &&
						(result.result as { value: boolean }).value === true;
					return isVisible ? true : null;
				},
				{ timeout },
			);
		}

		return new ElementHandle(this, target);
	}

	/**
	 * Wait for a JavaScript function to return a truthy value.
	 *
	 * ```ts
	 * await page.waitForFunction('document.querySelectorAll("li").length > 5');
	 * await page.waitForFunction(() => window.appReady === true);
	 * ```
	 */
	async waitForFunction<T = unknown>(
		expression: string | (() => T),
		options?: { timeout?: number },
	): Promise<T> {
		const timeout = options?.timeout ?? this.config.timeout;
		const expr = typeof expression === 'function' ? `(${expression.toString()})()` : expression;

		return waitFor(
			'function to return truthy',
			async () => {
				const result = await this.session.script.evaluate({
					expression: expr,
					target: { context: this.contextId },
					awaitPromise: true,
				});

				if (result.type === 'exception') return null;

				const value = this.deserializeRemoteValue(result.result);
				return value ? (value as T) : null;
			},
			{ timeout },
		);
	}

	/**
	 * Wait for a specific URL. Usually you use expect(page).toHaveURL() instead.
	 */
	async waitForURL(url: string | RegExp, options?: { timeout?: number }): Promise<void> {
		const timeout = options?.timeout ?? this.config.timeout;

		await waitFor(
			`URL to match ${url}`,
			async () => {
				const currentUrl = await this.url();
				if (typeof url === 'string') {
					return currentUrl.includes(url) ? true : null;
				}
				return url.test(currentUrl) ? true : null;
			},
			{ timeout },
		);
	}

	/**
	 * Wait for the page to finish loading.
	 */
	async waitForLoadState(state?: 'load' | 'domcontentloaded'): Promise<void> {
		await waitForLoadState(this.session, this.contextId, state, this.config.timeout);
	}

	// -----------------------------------------------------------------------
	// English API aliases — reads like instructions to a person
	// -----------------------------------------------------------------------

	/**
	 * Navigate to a URL. English-friendly alias for goto().
	 *
	 * ```ts
	 * await page.go('https://example.com');
	 * await page.go('/login');
	 * ```
	 */
	async go(url: string, options?: GotoOptions): Promise<void> {
		return this.goto(url, options);
	}

	/**
	 * Assert that an element with the given text is visible on the page.
	 * Returns the ElementHandle for further assertions.
	 *
	 * ```ts
	 * await page.see('Welcome back!');
	 * await page.see('Products');
	 * await page.see({ role: 'heading', name: 'Dashboard' });
	 * ```
	 */
	async see(target: ElementTarget, options?: { timeout?: number }): Promise<ElementHandle> {
		const timeout = options?.timeout ?? this.config.timeout;
		const startTime = Date.now();

		// Step 1: Locate the element (auto-waits for it to exist in DOM, self-heals if needed)
		const located = await this.locateWithHealing(target, 'see', { timeout });
		const ref = this.getSharedRef(located.node);

		// Step 2: Poll until the element is visible (handles CSS transitions, lazy rendering, etc.)
		const elapsed = Date.now() - startTime;
		const remaining = Math.max(timeout - elapsed, 5000);
		await waitFor(
			`${describeTarget(target)} to be visible`,
			async () => {
				try {
					const result = await this.session.script.callFunction({
						functionDeclaration: `function(el) {
							const style = window.getComputedStyle(el);
							const rect = el.getBoundingClientRect();
							return style.display !== 'none' && style.visibility !== 'hidden' &&
								style.opacity !== '0' && rect.width > 0 && rect.height > 0;
						}`,
						target: { context: this.contextId },
						arguments: [ref],
						awaitPromise: false,
					});
					if (
						result.type === 'success' &&
						result.result?.type === 'boolean' &&
						(result.result as { value: boolean }).value === true
					) {
						return true;
					}
					return null;
				} catch {
					return null;
				}
			},
			{ timeout: remaining },
		);

		return new ElementHandle(this, target);
	}

	// -----------------------------------------------------------------------
	// Network interception & observation
	// -----------------------------------------------------------------------

	/**
	 * Intercept network requests matching a pattern. Calls your handler
	 * for each matching request, letting you modify or respond to it.
	 *
	 * ```ts
	 * await page.intercept('POST /api/login', async (request) => {
	 *   // Modify request, or provide a response
	 *   return { status: 200, body: { token: 'abc' } };
	 * });
	 * ```
	 */
	async intercept(
		pattern: string,
		handler: (
			request: InterceptedRequest,
		) => Promise<MockResponse | undefined> | MockResponse | undefined,
	): Promise<void> {
		const { method, urlPattern } = parseMockPattern(pattern);

		await this.session.subscribe(['network.beforeRequestSent'], [this.contextId]);

		const result = await this.session.network.addIntercept({
			phases: ['beforeRequestSent'],
			urlPatterns: [urlPattern],
			contexts: [this.contextId],
		});
		this.interceptIds.push(result.intercept);

		const unsubscribe = this.session.on('network.beforeRequestSent', async (event) => {
			const params = event.params as {
				context: string;
				request: {
					request: string;
					method: string;
					url: string;
					headers: Array<{ name: string; value: { type: string; value: string } }>;
				};
				isBlocked: boolean;
				intercepts?: string[];
			};

			if (!params.isBlocked || params.context !== this.contextId) return;
			if (!params.intercepts?.includes(result.intercept)) return;

			if (method && params.request.method.toUpperCase() !== method.toUpperCase()) {
				await this.session.network.continueRequest({ request: params.request.request });
				return;
			}

			const reqInfo: InterceptedRequest = {
				url: params.request.url,
				method: params.request.method,
				headers: Object.fromEntries(params.request.headers.map((h) => [h.name, h.value.value])),
			};

			try {
				const response = await handler(reqInfo);
				if (response) {
					const headers = buildMockHeaders(response);
					const body = buildMockBody(response);
					await this.session.network.provideResponse({
						request: params.request.request,
						statusCode: response.status ?? 200,
						headers,
						body: body ? { type: 'string', value: body } : undefined,
					});
				} else {
					await this.session.network.continueRequest({ request: params.request.request });
				}
			} catch {
				await this.session.network.continueRequest({ request: params.request.request });
			}
		});
		this.eventCleanups.push(unsubscribe);
	}

	/**
	 * Wait for a network response matching a URL pattern.
	 *
	 * ```ts
	 * const response = await page.waitForResponse('/api/users');
	 * console.log(response.status); // 200
	 * ```
	 */
	async waitForResponse(
		urlPattern: string | RegExp,
		options?: { timeout?: number; method?: string },
	): Promise<{ url: string; status: number; method: string }> {
		const timeout = options?.timeout ?? this.config.timeout;
		const method = options?.method?.toUpperCase();

		await this.session.subscribe(['network.responseCompleted'], [this.contextId]);

		try {
			const event = await this.session.waitForEvent(
				'network.responseCompleted',
				(e) => {
					const params = e.params as {
						context: string;
						request: { method: string; url: string };
						response: { status: number };
					};
					if (params.context !== this.contextId) return false;
					if (method && params.request.method.toUpperCase() !== method) return false;

					const url = params.request.url;
					if (typeof urlPattern === 'string') {
						return url.includes(urlPattern);
					}
					return urlPattern.test(url);
				},
				timeout,
			);

			const params = event.params as {
				request: { method: string; url: string };
				response: { status: number };
			};
			return {
				url: params.request.url,
				status: params.response.status,
				method: params.request.method,
			};
		} finally {
			await this.session
				.unsubscribe(['network.responseCompleted'], [this.contextId])
				.catch(() => {});
		}
	}

	/**
	 * Block network requests matching URL patterns (e.g., ads, analytics).
	 *
	 * ```ts
	 * await page.blockRequests(['*.google-analytics.com*', '*.doubleclick.net*']);
	 * await page.blockRequests(['/api/telemetry']);
	 * ```
	 */
	async blockRequests(patterns: string[]): Promise<void> {
		await this.session.subscribe(['network.beforeRequestSent'], [this.contextId]);

		for (const pattern of patterns) {
			const urlPattern = pattern.startsWith('http')
				? { type: 'string' as const, pattern }
				: { type: 'pattern' as const, pathname: pattern };

			const result = await this.session.network.addIntercept({
				phases: ['beforeRequestSent'],
				urlPatterns: [urlPattern],
				contexts: [this.contextId],
			});
			this.interceptIds.push(result.intercept);

			const unsubscribe = this.session.on('network.beforeRequestSent', async (event) => {
				const params = event.params as {
					context: string;
					request: { request: string; url: string };
					isBlocked: boolean;
					intercepts?: string[];
				};

				if (!params.isBlocked || params.context !== this.contextId) return;
				if (!params.intercepts?.includes(result.intercept)) return;

				// Fail the request (block it)
				await this.session.network.failRequest({ request: params.request.request });
			});
			this.eventCleanups.push(unsubscribe);
		}
	}

	// -----------------------------------------------------------------------
	// Lifecycle
	// -----------------------------------------------------------------------

	/**
	 * Close this page/tab.
	 */
	async close(): Promise<void> {
		// Clean up all mocks and event listeners
		await this.clearMocks();

		await this.session.browsingContext.close({ context: this.contextId });
	}

	// -----------------------------------------------------------------------
	// Keyboard shortcuts
	// -----------------------------------------------------------------------

	/**
	 * Press a keyboard key.
	 *
	 * ```ts
	 * await page.press('Enter');
	 * await page.press('Control+a');
	 * ```
	 */
	async press(key: string): Promise<void> {
		const keys = key.split('+');
		const actions: Array<{ type: 'keyDown'; value: string } | { type: 'keyUp'; value: string }> =
			[];

		// Press modifiers down
		for (const k of keys) {
			actions.push({ type: 'keyDown', value: mapKey(k) });
		}
		// Release in reverse order
		for (const k of keys.reverse()) {
			actions.push({ type: 'keyUp', value: mapKey(k) });
		}

		await this.session.input.performActions({
			context: this.contextId,
			actions: [{ type: 'key', id: 'keyboard', actions }],
		});
	}

	// -----------------------------------------------------------------------
	// Private helpers
	// -----------------------------------------------------------------------

	/**
	 * Locate an element with automatic self-healing on failure.
	 *
	 * When locateElement() throws ElementNotFoundError, this method:
	 * 1. Captures a lightweight DOM snapshot of the page
	 * 2. Calls healSelector() to find a likely replacement
	 * 3. If healed, retries with the new selector and logs a warning
	 *
	 * Zero user configuration. Zero new API. Just smarter element finding.
	 */
	private async locateWithHealing(
		target: ElementTarget,
		action: string,
		options: { timeout: number },
	): Promise<LocatedElement> {
		const adaptedOptions = { timeout: this.adaptTimeout(options.timeout) };
		try {
			return await locateElement(this.session, this.contextId, target, adaptedOptions);
		} catch (err) {
			// Only attempt healing for ElementNotFoundError with CSS/testId selectors
			if (!(err instanceof ElementNotFoundError)) throw err;

			// Only heal selector-based targets (not text/role — those don't "break")
			const selectorText = this.extractSelector(target);
			if (!selectorText) throw err;

			try {
				// Dynamically import self-healing (browsecraft-ai is optional)
				// Use a variable so TypeScript doesn't try to resolve the module at build time
				const aiPkg = 'browsecraft-ai';
				// biome-ignore lint/suspicious/noExplicitAny: optional dynamic import
				const { healSelector } = (await import(aiPkg)) as any;

				const snapshot = await this.captureSnapshot();
				const aiConfig = resolveAIConfig(this.config.ai);

				const result = await healSelector(selectorText, snapshot, {
					context: `${action} action on ${typeof target === 'string' ? target : selectorText}`,
					useAI: aiConfig !== null,
					provider: aiConfig
						? {
								provider: aiConfig.provider,
								token: 'token' in aiConfig ? (aiConfig as { token?: string }).token : undefined,
								baseUrl:
									'baseUrl' in aiConfig ? (aiConfig as { baseUrl?: string }).baseUrl : undefined,
							}
						: undefined,
				});

				if (result.healed && result.selector) {
					// Log warning so users know and can update their selectors
					console.warn(
						`\u26A0 [browsecraft] Self-healed: '${selectorText}' \u2192 '${result.selector}' (${result.method}, ${(result.confidence * 100).toFixed(0)}% confidence)`,
					);

					// Retry with the healed selector
					return await locateElement(
						this.session,
						this.contextId,
						{ selector: result.selector },
						adaptedOptions,
					);
				}
			} catch {
				// Self-healing failed or browsecraft-ai not available — throw original error
			}

			throw err;
		}
	}

	/**
	 * Capture a lightweight DOM snapshot for self-healing.
	 * Extracts interactive elements with their attributes for matching.
	 */
	private async captureSnapshot(): Promise<{
		url: string;
		title: string;
		elements: Array<{
			tag: string;
			id?: string;
			classes?: string[];
			text?: string;
			ariaLabel?: string;
			role?: string;
			type?: string;
			name?: string;
			placeholder?: string;
			href?: string;
			testId?: string;
			selector: string;
		}>;
	}> {
		const [url, title] = await Promise.all([this.url(), this.title()]);

		const result = await this.session.script.callFunction({
			functionDeclaration: `function() {
				const selectors = 'button, a, input, select, textarea, [role], [data-testid], [data-test-id], [aria-label], label, h1, h2, h3, h4, h5, h6, img, nav, form';
				const els = document.querySelectorAll(selectors);
				const elements = [];

				for (const el of els) {
					if (elements.length >= 100) break;

					const rect = el.getBoundingClientRect();
					if (rect.width === 0 && rect.height === 0) continue;

					const id = el.id || undefined;
					const classes = el.className && typeof el.className === 'string'
						? el.className.split(/\\s+/).filter(Boolean)
						: undefined;
					const text = (el.innerText || '').trim().slice(0, 200) || undefined;
					const ariaLabel = el.getAttribute('aria-label') || undefined;
					const role = el.getAttribute('role') || undefined;
					const type = el.getAttribute('type') || undefined;
					const name = el.getAttribute('name') || undefined;
					const placeholder = el.getAttribute('placeholder') || undefined;
					const href = el.tagName === 'A' ? el.getAttribute('href') || undefined : undefined;
					const testId = el.getAttribute('data-testid') || el.getAttribute('data-test-id') || undefined;

					// Generate a unique selector
					let selector;
					if (id) selector = '#' + id;
					else if (testId) selector = '[data-testid="' + testId + '"]';
					else {
						const tag = el.tagName.toLowerCase();
						const nth = Array.from(el.parentNode?.children || []).indexOf(el);
						selector = tag + (classes && classes.length ? '.' + classes[0] : '') + ':nth-child(' + (nth + 1) + ')';
					}

					elements.push({
						tag: el.tagName.toLowerCase(),
						id, classes, text, ariaLabel, role, type, name, placeholder, href, testId, selector
					});
				}
				return elements;
			}`,
			target: { context: this.contextId },
			awaitPromise: false,
		});

		let elements: Array<{ tag: string; selector: string; [key: string]: unknown }> = [];
		if (result.type === 'success' && result.result?.type === 'array') {
			const arr = result.result.value as unknown[];
			elements = arr
				.map((item) => this.deserializeRemoteValue(item))
				.filter(
					(e): e is { tag: string; selector: string; [key: string]: unknown } =>
						e !== null && typeof e === 'object' && 'tag' in e && 'selector' in e,
				);
		}

		return { url, title, elements };
	}

	/**
	 * Extract a CSS selector string from a target, if applicable.
	 * Only returns a value for selector-based or CSS-like targets.
	 */
	private extractSelector(target: ElementTarget): string | null {
		if (typeof target === 'string') {
			// If it looks like a CSS selector (starts with # . [ or contains :)
			return target.match(/^[#.\[]/) || target.includes(':') ? target : null;
		}
		return (target.selector ?? target.testId) ? `[data-testid="${target.testId}"]` : null;
	}

	/**
	 * Ensure an element is actionable (visible + enabled) before interacting.
	 * Throws a rich ElementNotActionableError if it's not ready within the timeout.
	 */
	/**
	 * Apply the adaptive timing multiplier to a timeout.
	 * On slow environments, timeouts automatically scale up so tests don't
	 * flake. On fast machines the multiplier stays 1.0 — no overhead.
	 * @internal
	 */
	private adaptTimeout(ms: number): number {
		return Math.round(ms * this.timingMultiplier);
	}

	private async ensureActionable(
		located: LocatedElement,
		action: string,
		target: ElementTarget,
		options: { timeout: number; enabled?: boolean },
	): Promise<void> {
		const ref = this.getSharedRef(located.node);
		const targetDesc = typeof target === 'string' ? target : describeTarget(target);

		const result = await waitForActionable(
			this.session,
			this.contextId,
			ref,
			targetDesc,
			{ timeout: this.adaptTimeout(Math.min(options.timeout, 5000)) },
			{
				visible: true,
				enabled: options.enabled !== false,
			},
		);

		if (!result.actionable && result.reason) {
			throw new ElementNotActionableError({
				action,
				target: targetDesc,
				reason: result.reason,
				elementState: result.state,
				elapsed: options.timeout,
			});
		}
	}

	/** Resolve a relative URL against the baseURL */
	private resolveURL(url: string): string {
		if (
			url.startsWith('http://') ||
			url.startsWith('https://') ||
			url.startsWith('about:') ||
			url.startsWith('data:')
		) {
			return url;
		}
		const base = this.config.baseURL.replace(/\/$/, '');
		const path = url.startsWith('/') ? url : `/${url}`;
		return base ? `${base}${path}` : url;
	}

	/** Get a shared reference from a located node */
	private getSharedRef(node: NodeRemoteValue): SharedReference {
		if (node.sharedId) {
			return { sharedId: node.sharedId, handle: node.handle };
		}
		throw new Error('Element has no shared reference. This is a bug in Browsecraft.');
	}

	/** Get the center coordinates of an element */
	private async getElementCenter(ref: SharedReference): Promise<{ x: number; y: number }> {
		const result = await this.session.script.callFunction({
			functionDeclaration: `function(el) {
				const rect = el.getBoundingClientRect();
				if (rect.width === 0 && rect.height === 0) {
					throw new Error('Element has zero size -- it may be hidden or not rendered');
				}
				return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
			}`,
			target: { context: this.contextId },
			arguments: [ref],
			awaitPromise: false,
		});

		if (result.type === 'exception') {
			const errorText = result.exceptionDetails?.text ?? 'Failed to get element position';
			throw new Error(`Cannot interact with element: ${errorText}`);
		}

		if (result.type === 'success' && result.result?.type === 'object') {
			const val = result.result.value as unknown;
			if (Array.isArray(val)) {
				// BiDi serializes objects as [["key", value], ...] pairs
				const map = new Map(val as [string, unknown][]);
				const xVal = map.get('x');
				const yVal = map.get('y');
				const x =
					typeof xVal === 'object' && xVal !== null && 'value' in xVal
						? (xVal as { value: number }).value
						: null;
				const y =
					typeof yVal === 'object' && yVal !== null && 'value' in yVal
						? (yVal as { value: number }).value
						: null;
				if (x !== null && y !== null) {
					return { x, y };
				}
			}
		}

		throw new Error(
			'Cannot get element position: unexpected response from browser. ' +
				'The element may not be visible or may not have a bounding rectangle.',
		);
	}

	/**
	 * Scroll element into view and click it.
	 *
	 * Uses JavaScript `.click()` as the primary mechanism because it is
	 * immune to viewport coordinate mismatches, DPI scaling, layout shifts,
	 * and Chrome BiDi's unreliable element-origin support. This works
	 * identically in headless and headed mode, with or without slowMo delays.
	 *
	 * The element is scrolled into view first so it's visible in headed mode
	 * (important when users are watching the test run).
	 */
	private async scrollIntoViewAndClick(
		located: LocatedElement,
		options?: ClickOptions,
	): Promise<void> {
		const ref = this.getSharedRef(located.node);
		const clickCount = options?.clickCount ?? 1;

		// Scroll element into view so it's visible (especially in headed mode).
		// Use JS click for reliability — it dispatches the click event directly
		// on the element regardless of viewport coordinates or layout shifts.
		await this.session.script.callFunction({
			functionDeclaration: `function(el, clickCount) {
				el.scrollIntoView({ block: "center", behavior: "instant" });
				for (let i = 0; i < clickCount; i++) {
					el.click();
				}
			}`,
			target: { context: this.contextId },
			arguments: [ref, { type: 'number', value: clickCount }],
			awaitPromise: false,
		});
	}

	/**
	 * Evaluate a simple string expression with automatic retry on transient
	 * context errors.  During cross-origin navigation the JavaScript realm is
	 * destroyed and recreated — any `script.evaluate` call in that brief
	 * window receives "Cannot find context with specified id".  This helper
	 * uses the existing `waitFor` polling engine to retry until the new realm
	 * is ready (up to `timeout` ms, default 5 000).
	 */
	private async evaluateWithNavRetry(expression: string, timeout = 5_000): Promise<string> {
		return waitFor(
			`evaluate "${expression}"`,
			async () => {
				const result = await this.session.script.evaluate({
					expression,
					target: { context: this.contextId },
					awaitPromise: false,
				});
				const value = this.extractStringResult(result);
				// Return the string value — even empty string is valid.
				// null means the result wasn't a string (e.g., page mid-navigation
				// returned an exception), so we return null to trigger a retry.
				return value;
			},
			{ timeout, interval: 100 },
		);
	}

	/** Extract a string from a script evaluation result */
	private extractStringResult(result: ScriptEvaluateResult): string | null {
		if (result.type === 'success' && result.result?.type === 'string') {
			return (result.result as { value: string }).value;
		}
		return null;
	}

	/** Convert a BiDi RemoteValue back to a JS value */
	private deserializeRemoteValue(value: unknown): unknown {
		if (!value || typeof value !== 'object') return value;
		const v = value as { type: string; value?: unknown };
		switch (v.type) {
			case 'undefined':
				return undefined;
			case 'null':
				return null;
			case 'string':
				return v.value;
			case 'number': {
				const n = v.value;
				if (n === 'NaN') return Number.NaN;
				if (n === '-0') return -0;
				if (n === 'Infinity') return Number.POSITIVE_INFINITY;
				if (n === '-Infinity') return Number.NEGATIVE_INFINITY;
				return n;
			}
			case 'boolean':
				return v.value;
			case 'bigint':
				return BigInt(v.value as string);
			case 'array': {
				if (Array.isArray(v.value)) {
					return (v.value as unknown[]).map((item) => this.deserializeRemoteValue(item));
				}
				return [];
			}
			case 'object': {
				if (Array.isArray(v.value)) {
					const obj: Record<string, unknown> = {};
					for (const [key, val] of v.value as [string, unknown][]) {
						obj[key] = this.deserializeRemoteValue(val);
					}
					return obj;
				}
				return {};
			}
			default:
				return v.value ?? null;
		}
	}
}

// ---------------------------------------------------------------------------
// ElementHandle -- returned by page.get() for use with assertions
// ---------------------------------------------------------------------------

/**
 * A lazy reference to an element. Does not locate the element until
 * you interact with it or assert on it.
 */
export class ElementHandle {
	/** @internal */
	readonly page: Page;
	/** @internal */
	readonly target: ElementTarget;

	constructor(page: Page, target: ElementTarget) {
		this.page = page;
		this.target = target;
	}

	/** Click this element */
	async click(options?: ClickOptions): Promise<void> {
		await this.page.click(this.target, options);
	}

	/** Fill this element with text */
	async fill(value: string, options?: FillOptions): Promise<void> {
		await this.page.fill(this.target, value, options);
	}

	/** Get the visible text content of this element */
	async textContent(): Promise<string> {
		const located = await this.locate();
		const ref = this.getRef(located);

		const result = await this.page.session.script.callFunction({
			functionDeclaration: 'function(el) { return el.textContent || ""; }',
			target: { context: this.page.contextId },
			arguments: [ref],
			awaitPromise: false,
		});

		if (result.type === 'success' && result.result?.type === 'string') {
			return (result.result as { value: string }).value;
		}
		return '';
	}

	/** Get an attribute value */
	async getAttribute(name: string): Promise<string | null> {
		const located = await this.locate();
		const ref = this.getRef(located);

		const result = await this.page.session.script.callFunction({
			functionDeclaration: 'function(el, name) { return el.getAttribute(name); }',
			target: { context: this.page.contextId },
			arguments: [ref, { type: 'string', value: name }],
			awaitPromise: false,
		});

		if (result.type === 'success' && result.result?.type === 'string') {
			return (result.result as { value: string }).value;
		}
		return null;
	}

	/** Check if the element is visible on the page */
	async isVisible(): Promise<boolean> {
		try {
			const located = await this.locate(5000);
			const ref = this.getRef(located);

			const result = await this.page.session.script.callFunction({
				functionDeclaration: `function(el) {
					const style = window.getComputedStyle(el);
					const rect = el.getBoundingClientRect();
					return style.display !== 'none' &&
						style.visibility !== 'hidden' &&
						style.opacity !== '0' &&
						rect.width > 0 &&
						rect.height > 0;
				}`,
				target: { context: this.page.contextId },
				arguments: [ref],
				awaitPromise: false,
			});

			return (
				result.type === 'success' &&
				result.result?.type === 'boolean' &&
				(result.result as { value: boolean }).value === true
			);
		} catch {
			return false;
		}
	}

	/** Count matching elements */
	async count(): Promise<number> {
		const elements = await locateAllElements(this.page.session, this.page.contextId, this.target);
		return elements.length;
	}

	/** Get the visible inner text (like element.innerText, not textContent) */
	async innerText(): Promise<string> {
		const located = await this.locate();
		const ref = this.getRef(located);

		const result = await this.page.session.script.callFunction({
			functionDeclaration: 'function(el) { return el.innerText || ""; }',
			target: { context: this.page.contextId },
			arguments: [ref],
			awaitPromise: false,
		});

		if (result.type === 'success' && result.result?.type === 'string') {
			return (result.result as { value: string }).value;
		}
		return '';
	}

	/** Get the innerHTML of this element */
	async innerHTML(): Promise<string> {
		const located = await this.locate();
		const ref = this.getRef(located);

		const result = await this.page.session.script.callFunction({
			functionDeclaration: 'function(el) { return el.innerHTML || ""; }',
			target: { context: this.page.contextId },
			arguments: [ref],
			awaitPromise: false,
		});

		if (result.type === 'success' && result.result?.type === 'string') {
			return (result.result as { value: string }).value;
		}
		return '';
	}

	/** Get the current value of an input/textarea/select */
	async inputValue(): Promise<string> {
		const located = await this.locate();
		const ref = this.getRef(located);

		const result = await this.page.session.script.callFunction({
			functionDeclaration: 'function(el) { return el.value ?? ""; }',
			target: { context: this.page.contextId },
			arguments: [ref],
			awaitPromise: false,
		});

		if (result.type === 'success' && result.result?.type === 'string') {
			return (result.result as { value: string }).value;
		}
		return '';
	}

	/** Check if the element is enabled (not disabled) */
	async isEnabled(): Promise<boolean> {
		try {
			const located = await this.locate(5000);
			const ref = this.getRef(located);

			const result = await this.page.session.script.callFunction({
				functionDeclaration: 'function(el) { return !el.disabled; }',
				target: { context: this.page.contextId },
				arguments: [ref],
				awaitPromise: false,
			});

			return (
				result.type === 'success' &&
				result.result?.type === 'boolean' &&
				(result.result as { value: boolean }).value === true
			);
		} catch {
			return false;
		}
	}

	/** Check if a checkbox/radio is checked */
	async isChecked(): Promise<boolean> {
		try {
			const located = await this.locate(5000);
			const ref = this.getRef(located);

			const result = await this.page.session.script.callFunction({
				functionDeclaration: 'function(el) { return !!el.checked; }',
				target: { context: this.page.contextId },
				arguments: [ref],
				awaitPromise: false,
			});

			return (
				result.type === 'success' &&
				result.result?.type === 'boolean' &&
				(result.result as { value: boolean }).value === true
			);
		} catch {
			return false;
		}
	}

	/** Get the bounding box of the element */
	async boundingBox(): Promise<{ x: number; y: number; width: number; height: number } | null> {
		try {
			const located = await this.locate(5000);
			const ref = this.getRef(located);

			const result = await this.page.session.script.callFunction({
				functionDeclaration: `function(el) {
					const rect = el.getBoundingClientRect();
					return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
				}`,
				target: { context: this.page.contextId },
				arguments: [ref],
				awaitPromise: false,
			});

			if (result.type === 'success' && result.result?.type === 'object') {
				const val = result.result.value as unknown;
				if (Array.isArray(val)) {
					const map = new Map(val as [string, unknown][]);
					const extract = (key: string) => {
						const v = map.get(key);
						return typeof v === 'object' && v !== null && 'value' in v
							? (v as { value: number }).value
							: 0;
					};
					return {
						x: extract('x'),
						y: extract('y'),
						width: extract('width'),
						height: extract('height'),
					};
				}
			}
			return null;
		} catch {
			return null;
		}
	}

	/** Take a screenshot of just this element */
	async screenshot(): Promise<Buffer> {
		const located = await this.locate();
		const ref = this.getRef(located);

		// Scroll into view first
		await this.page.session.script.callFunction({
			functionDeclaration:
				'function(el) { el.scrollIntoView({ block: "center", behavior: "instant" }); }',
			target: { context: this.page.contextId },
			arguments: [ref],
			awaitPromise: false,
		});

		// Get bounding box for clipping
		const box = await this.boundingBox();
		if (!box || box.width === 0 || box.height === 0) {
			throw new Error('Cannot screenshot element: element has no size or is not visible');
		}

		const result = await this.page.session.browsingContext.captureScreenshot({
			context: this.page.contextId,
			clip: {
				type: 'box',
				x: box.x,
				y: box.y,
				width: box.width,
				height: box.height,
			},
		} satisfies BrowsingContextCaptureScreenshotParams);

		return Buffer.from(result.data, 'base64');
	}

	/** Double-click this element */
	async dblclick(options?: ClickOptions): Promise<void> {
		await this.page.dblclick(this.target, options);
	}

	/** Hover over this element */
	async hover(options?: { timeout?: number }): Promise<void> {
		await this.page.hover(this.target, options);
	}

	/** Type text into this element character by character */
	async type(text: string, options?: FillOptions): Promise<void> {
		await this.page.type(this.target, text, options);
	}

	/** Focus this element */
	async focus(options?: { timeout?: number }): Promise<void> {
		await this.page.focus(this.target, options);
	}

	/** Remove focus from this element */
	async blur(options?: { timeout?: number }): Promise<void> {
		await this.page.blur(this.target, options);
	}

	/** @internal Locate the element with auto-wait */
	async locate(timeout?: number): Promise<LocatedElement> {
		return locateElement(this.page.session, this.page.contextId, this.target, {
			timeout: timeout ?? 30_000,
		});
	}

	private getRef(located: LocatedElement): SharedReference {
		if (located.node.sharedId) {
			return { sharedId: located.node.sharedId, handle: located.node.handle };
		}
		throw new Error('Element has no shared reference');
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Human-readable description of a target (for error messages) */
function describeTarget(target: ElementTarget): string {
	if (typeof target === 'string') return target;
	const parts: string[] = [];
	if (target.role) parts.push(`role="${target.role}"`);
	if (target.name) parts.push(`name="${target.name}"`);
	if (target.text) parts.push(`text="${target.text}"`);
	if (target.label) parts.push(`label="${target.label}"`);
	if (target.testId) parts.push(`testId="${target.testId}"`);
	if (target.selector) parts.push(`selector="${target.selector}"`);
	return `[${parts.join(', ')}]`;
}

/** Map friendly key names to WebDriver key codes */
function mapKey(key: string): string {
	const keyMap: Record<string, string> = {
		Enter: '\uE007',
		Tab: '\uE004',
		Escape: '\uE00C',
		Backspace: '\uE003',
		Delete: '\uE017',
		ArrowUp: '\uE013',
		ArrowDown: '\uE015',
		ArrowLeft: '\uE012',
		ArrowRight: '\uE014',
		Home: '\uE011',
		End: '\uE010',
		PageUp: '\uE00E',
		PageDown: '\uE00F',
		Control: '\uE009',
		Alt: '\uE00A',
		Shift: '\uE008',
		Meta: '\uE03D',
		Space: ' ',
	};
	return keyMap[key] ?? key;
}

/** Parse "GET /api/users" or "/api/users" or "https://..." into method + urlPattern */
function parseMockPattern(pattern: string): {
	method: string | null;
	urlPattern:
		| { type: 'string'; pattern: string }
		| { type: 'pattern'; pathname?: string; protocol?: string; hostname?: string };
} {
	const methodMatch = pattern.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(.+)$/i);
	if (methodMatch) {
		const method = methodMatch[1]!.toUpperCase();
		const path = methodMatch[2]!;
		if (path.startsWith('http')) {
			return { method, urlPattern: { type: 'string', pattern: path } };
		}
		return { method, urlPattern: { type: 'pattern', pathname: path } };
	}

	if (pattern.startsWith('http')) {
		return { method: null, urlPattern: { type: 'string', pattern } };
	}

	return { method: null, urlPattern: { type: 'pattern', pathname: pattern } };
}

/** Build response headers for a mock */
function buildMockHeaders(
	response: MockResponse,
): Array<{ name: string; value: { type: 'string'; value: string } }> {
	const headers: Array<{ name: string; value: { type: 'string'; value: string } }> = [];

	// Content-Type
	let contentType = response.contentType;
	if (!contentType) {
		if (typeof response.body === 'object' && response.body !== null) {
			contentType = 'application/json';
		} else if (typeof response.body === 'string') {
			contentType = 'text/plain';
		}
	}
	if (contentType) {
		headers.push({ name: 'Content-Type', value: { type: 'string', value: contentType } });
	}

	// Custom headers
	if (response.headers) {
		for (const [name, value] of Object.entries(response.headers)) {
			headers.push({ name, value: { type: 'string', value } });
		}
	}

	return headers;
}

/** Build response body string */
function buildMockBody(response: MockResponse): string | null {
	if (response.body === undefined || response.body === null) return null;
	if (typeof response.body === 'string') return response.body;
	return JSON.stringify(response.body);
}
