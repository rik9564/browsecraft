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
	NodeRemoteValue,
	SharedReference,
	ScriptEvaluateResult,
	StorageCookie,
	NetworkSetCookieHeader,
} from 'browsecraft-bidi';
import { locateElement, locateAllElements, type ElementTarget, type LocatedElement } from './locator.js';
import { waitFor, waitForLoadState, type WaitOptions } from './wait.js';
import type { BrowsecraftConfig } from './config.js';

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

		await this.session.browsingContext.navigate({
			context: this.contextId,
			url: fullUrl,
			wait: waitUntil,
		});
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
		const located = await locateElement(this.session, this.contextId, target, { timeout });

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

		// For string targets, treat as label/placeholder for inputs
		const resolvedTarget: ElementTarget = typeof target === 'string'
			? { label: target, name: target }
			: target;

		const located = await locateElement(this.session, this.contextId, resolvedTarget, { timeout });

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

		const resolvedTarget: ElementTarget = typeof target === 'string'
			? { label: target, name: target }
			: target;

		const located = await locateElement(this.session, this.contextId, resolvedTarget, { timeout });

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
		const resolvedTarget: ElementTarget = typeof target === 'string'
			? { label: target, name: target }
			: target;

		const located = await locateElement(this.session, this.contextId, resolvedTarget, { timeout });
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
		const located = await locateElement(this.session, this.contextId, target, { timeout });
		const ref = this.getSharedRef(located.node);

		// Only click if not already checked
		const result = await this.session.script.callFunction({
			functionDeclaration: 'function(el) { return el.checked; }',
			target: { context: this.contextId },
			arguments: [ref],
			awaitPromise: false,
		});

		const isChecked = result.type === 'success' &&
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
		const located = await locateElement(this.session, this.contextId, target, { timeout });
		const ref = this.getSharedRef(located.node);

		const result = await this.session.script.callFunction({
			functionDeclaration: 'function(el) { return el.checked; }',
			target: { context: this.contextId },
			arguments: [ref],
			awaitPromise: false,
		});

		const isChecked = result.type === 'success' &&
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
		const located = await locateElement(this.session, this.contextId, target, { timeout });
		const ref = this.getSharedRef(located.node);

		// Scroll into view first so coordinates are accurate
		await this.session.script.callFunction({
			functionDeclaration: 'function(el) { el.scrollIntoView({ block: "center", behavior: "instant" }); }',
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
			actions: [{
				type: 'pointer',
				id: 'mouse',
				parameters: { pointerType: 'mouse' },
				actions: [
					{ type: 'pointerMove', x: pos.x, y: pos.y, origin: 'viewport' },
				],
			}],
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

	/** Get the current page URL */
	async url(): Promise<string> {
		const result = await this.session.script.evaluate({
			expression: 'window.location.href',
			target: { context: this.contextId },
			awaitPromise: false,
		});
		return this.extractStringResult(result) ?? '';
	}

	/** Get the page title */
	async title(): Promise<string> {
		const result = await this.session.script.evaluate({
			expression: 'document.title',
			target: { context: this.contextId },
			awaitPromise: false,
		});
		return this.extractStringResult(result) ?? '';
	}

	/** Get the full page HTML content */
	async content(): Promise<string> {
		const result = await this.session.script.evaluate({
			expression: 'document.documentElement.outerHTML',
			target: { context: this.contextId },
			awaitPromise: false,
		});
		return this.extractStringResult(result) ?? '';
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
	async cookies(filter?: { name?: string; domain?: string; path?: string }): Promise<StorageCookie[]> {
		const result = await this.session.storage.getCookies({
			filter: filter ? {
				name: filter.name,
				domain: filter.domain,
				path: filter.path,
			} : undefined,
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
	async setCookies(cookies: Array<{ name: string; value: string; domain?: string; path?: string; httpOnly?: boolean; secure?: boolean; sameSite?: 'strict' | 'lax' | 'none'; expiry?: number }>): Promise<void> {
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
			filter: filter ? {
				name: filter.name,
				domain: filter.domain,
				path: filter.path,
			} : undefined,
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
		const expr = typeof expression === 'function'
			? `(${expression.toString()})()`
			: expression;

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
		await this.session.subscribe(
			['network.beforeRequestSent'],
			[this.contextId],
		);

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
		const located = await locateElement(this.session, this.contextId, target, { timeout });
		const ref = this.getSharedRef(located.node);

		// Scroll into view
		await this.session.script.callFunction({
			functionDeclaration: 'function(el) { el.scrollIntoView({ block: "center", behavior: "instant" }); }',
			target: { context: this.contextId },
			arguments: [ref],
			awaitPromise: false,
		});

		const pos = await this.getElementCenter(ref);

		await this.session.input.performActions({
			context: this.contextId,
			actions: [{
				type: 'pointer',
				id: 'touch',
				parameters: { pointerType: 'touch' },
				actions: [
					{ type: 'pointerMove', x: pos.x, y: pos.y, origin: 'viewport' },
					{ type: 'pointerDown', button: 0 },
					{ type: 'pointerUp', button: 0 },
				] as any,
			}],
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
		const resolvedTarget: ElementTarget = typeof target === 'string'
			? { label: target, name: target }
			: target;
		const located = await locateElement(this.session, this.contextId, resolvedTarget, { timeout });
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
		const resolvedTarget: ElementTarget = typeof target === 'string'
			? { label: target, name: target }
			: target;
		const located = await locateElement(this.session, this.contextId, resolvedTarget, { timeout });
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
		const located = await locateElement(this.session, this.contextId, target, { timeout });
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
		const located = await locateElement(this.session, this.contextId, target, { timeout });
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
		const resolvedTarget: ElementTarget = typeof target === 'string'
			? { label: target, name: target }
			: target;
		const located = await locateElement(this.session, this.contextId, resolvedTarget, { timeout });
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
	async selectOption(target: ElementTarget, values: string | string[], options?: FillOptions): Promise<void> {
		const timeout = options?.timeout ?? this.config.timeout;
		const resolvedTarget: ElementTarget = typeof target === 'string'
			? { label: target, name: target }
			: target;
		const located = await locateElement(this.session, this.contextId, resolvedTarget, { timeout });
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
			arguments: [ref, { type: 'array', value: valuesArray.map(v => ({ type: 'string' as const, value: v })) }],
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
	async dragTo(source: ElementTarget, dest: ElementTarget, options?: { timeout?: number }): Promise<void> {
		const timeout = options?.timeout ?? this.config.timeout;

		const sourceLoc = await locateElement(this.session, this.contextId, source, { timeout });
		const sourceRef = this.getSharedRef(sourceLoc.node);
		const sourcePos = await this.getElementCenter(sourceRef);

		const destLoc = await locateElement(this.session, this.contextId, dest, { timeout });
		const destRef = this.getSharedRef(destLoc.node);
		const destPos = await this.getElementCenter(destRef);

		await this.session.input.performActions({
			context: this.contextId,
			actions: [{
				type: 'pointer',
				id: 'mouse',
				parameters: { pointerType: 'mouse' },
				actions: [
					{ type: 'pointerMove', x: sourcePos.x, y: sourcePos.y, origin: 'viewport' },
					{ type: 'pointerDown', button: 0 },
					{ type: 'pointerMove', x: destPos.x, y: destPos.y, origin: 'viewport', duration: 300 },
					{ type: 'pointerUp', button: 0 },
				] as any,
			}],
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
	async waitForSelector(target: ElementTarget, options?: { timeout?: number; state?: 'attached' | 'visible' | 'hidden' }): Promise<ElementHandle> {
		const timeout = options?.timeout ?? this.config.timeout;
		const state = options?.state ?? 'visible';

		if (state === 'hidden') {
			// Wait for the element to disappear
			await waitFor(
				`element to be hidden`,
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
						const isHidden = result.type === 'success' &&
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
				`element to be visible`,
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
					const isVisible = result.type === 'success' &&
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
		const expr = typeof expression === 'function'
			? `(${expression.toString()})()`
			: expression;

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
		const actions: Array<{ type: 'keyDown'; value: string } | { type: 'keyUp'; value: string }> = [];

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

	/** Resolve a relative URL against the baseURL */
	private resolveURL(url: string): string {
		if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('about:') || url.startsWith('data:')) {
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
				const x = typeof xVal === 'object' && xVal !== null && 'value' in xVal ? (xVal as { value: number }).value : null;
				const y = typeof yVal === 'object' && yVal !== null && 'value' in yVal ? (yVal as { value: number }).value : null;
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
	private async scrollIntoViewAndClick(located: LocatedElement, options?: ClickOptions): Promise<void> {
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
			case 'undefined': return undefined;
			case 'null': return null;
			case 'string': return v.value;
			case 'number': {
				const n = v.value;
				if (n === 'NaN') return Number.NaN;
				if (n === '-0') return -0;
				if (n === 'Infinity') return Number.POSITIVE_INFINITY;
				if (n === '-Infinity') return Number.NEGATIVE_INFINITY;
				return n;
			}
			case 'boolean': return v.value;
			case 'bigint': return BigInt(v.value as string);
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
			functionDeclaration: `function(el, name) { return el.getAttribute(name); }`,
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

			return result.type === 'success' &&
				result.result?.type === 'boolean' &&
				(result.result as { value: boolean }).value === true;
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

			return result.type === 'success' &&
				result.result?.type === 'boolean' &&
				(result.result as { value: boolean }).value === true;
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

			return result.type === 'success' &&
				result.result?.type === 'boolean' &&
				(result.result as { value: boolean }).value === true;
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
						return typeof v === 'object' && v !== null && 'value' in v ? (v as { value: number }).value : 0;
					};
					return { x: extract('x'), y: extract('y'), width: extract('width'), height: extract('height') };
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
			functionDeclaration: 'function(el) { el.scrollIntoView({ block: "center", behavior: "instant" }); }',
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
		} as any);

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
		return locateElement(
			this.page.session,
			this.page.contextId,
			this.target,
			{ timeout: timeout ?? 30_000 },
		);
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
function parseMockPattern(pattern: string): { method: string | null; urlPattern: { type: 'string'; pattern: string } | { type: 'pattern'; pathname?: string; protocol?: string; hostname?: string } } {
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
function buildMockHeaders(response: MockResponse): Array<{ name: string; value: { type: 'string'; value: string } }> {
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
