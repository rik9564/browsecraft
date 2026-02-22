// ============================================================================
// Browsecraft - Assertion System
// Auto-retrying assertions that just work. No flaky tests.
//
// expect(page).toHaveURL('/dashboard');
// expect(page.get('Submit')).toBeVisible();
// expect(page.get('Cart')).toHaveText('3 items');
// ============================================================================

import type { ElementHandle, Page } from './page.js';
import { waitFor } from './wait.js';

/** Default timeout for assertions (5s is plenty for UI checks) */
const DEFAULT_ASSERTION_TIMEOUT = 5_000;

/** Options shared by all assertion matchers */
interface MatcherOptions {
	/** Timeout in ms (default: 5000) */
	timeout?: number;
}

// ---------------------------------------------------------------------------
// expect() entry point
// ---------------------------------------------------------------------------

/**
 * Create assertions on Pages or ElementHandles.
 * All matchers auto-retry until they pass or timeout.
 *
 * ```ts
 * await expect(page).toHaveURL('/dashboard');
 * await expect(page).toHaveTitle('My App');
 * await expect(page.get('Welcome')).toBeVisible();
 * await expect(page.get('Submit')).toHaveText('Submit Order');
 * ```
 */
export function expect(subject: Page): PageAssertions;
export function expect(subject: ElementHandle): ElementAssertions;
export function expect(subject: Page | ElementHandle): PageAssertions | ElementAssertions {
	if (
		subject instanceof
			// We can't import Page directly for instanceof due to circular deps,
			// so we check for the contextId property which only Page has
			Object &&
		'contextId' in subject &&
		'session' in subject &&
		!('target' in subject)
	) {
		return new PageAssertions(subject as Page);
	}
	return new ElementAssertions(subject as ElementHandle);
}

// ---------------------------------------------------------------------------
// Page Assertions
// ---------------------------------------------------------------------------

/**
 * Assertions for a Page. All matchers auto-retry.
 */
class PageAssertions {
	private page: Page;
	private _not = false;

	constructor(page: Page) {
		this.page = page;
	}

	/** Negate the assertion */
	get not(): PageAssertions {
		const negated = new PageAssertions(this.page);
		negated._not = !this._not;
		return negated;
	}

	/**
	 * Assert the page URL contains or matches the expected value.
	 *
	 * ```ts
	 * await expect(page).toHaveURL('/dashboard');
	 * await expect(page).toHaveURL(/dashboard/);
	 * ```
	 */
	async toHaveURL(expected: string | RegExp, options?: MatcherOptions): Promise<void> {
		const timeout = options?.timeout ?? DEFAULT_ASSERTION_TIMEOUT;
		const isNot = this._not;

		await retry(
			`URL to ${isNot ? 'not ' : ''}match ${expected}`,
			async () => {
				const actual = await this.page.url();
				const matches =
					typeof expected === 'string' ? actual.includes(expected) : expected.test(actual);
				return isNot ? !matches : matches;
			},
			(pass) => {
				if (!pass) {
					return `Expected URL ${isNot ? 'not ' : ''}to match ${expected}`;
				}
				return null;
			},
			timeout,
		);
	}

	/**
	 * Assert the page title matches.
	 *
	 * ```ts
	 * await expect(page).toHaveTitle('Dashboard');
	 * await expect(page).toHaveTitle(/Dashboard/);
	 * ```
	 */
	async toHaveTitle(expected: string | RegExp, options?: MatcherOptions): Promise<void> {
		const timeout = options?.timeout ?? DEFAULT_ASSERTION_TIMEOUT;
		const isNot = this._not;

		await retry(
			`title to ${isNot ? 'not ' : ''}match "${expected}"`,
			async () => {
				const actual = await this.page.title();
				const matches =
					typeof expected === 'string' ? actual.includes(expected) : expected.test(actual);
				return isNot ? !matches : matches;
			},
			(pass) => {
				if (!pass) {
					return `Expected title ${isNot ? 'not ' : ''}to match "${expected}"`;
				}
				return null;
			},
			timeout,
		);
	}

	/**
	 * Assert the page content (HTML body text) contains the expected text.
	 *
	 * ```ts
	 * await expect(page).toHaveContent('Welcome back');
	 * await expect(page).toHaveContent(/logged in as \w+/);
	 * ```
	 */
	async toHaveContent(expected: string | RegExp, options?: MatcherOptions): Promise<void> {
		const timeout = options?.timeout ?? DEFAULT_ASSERTION_TIMEOUT;
		const isNot = this._not;
		let lastContent = '';

		await retry(
			`page to ${isNot ? 'not ' : ''}contain "${expected}"`,
			async () => {
				const content = await this.page.evaluate<string>('document.body?.innerText || ""');
				lastContent = content.slice(0, 200); // keep for error message
				const matches =
					typeof expected === 'string' ? content.includes(expected) : expected.test(content);
				return isNot ? !matches : matches;
			},
			(pass) => {
				if (!pass) {
					return `Expected page ${isNot ? 'not ' : ''}to contain "${expected}"`;
				}
				return null;
			},
			timeout,
		);
	}
}

// ---------------------------------------------------------------------------
// Element Assertions
// ---------------------------------------------------------------------------

/**
 * Assertions for an ElementHandle. All matchers auto-retry.
 */
class ElementAssertions {
	private element: ElementHandle;
	private _not = false;

	constructor(element: ElementHandle) {
		this.element = element;
	}

	/** Negate the assertion */
	get not(): ElementAssertions {
		const negated = new ElementAssertions(this.element);
		negated._not = !this._not;
		return negated;
	}

	/**
	 * Assert the element is visible on the page.
	 *
	 * ```ts
	 * await expect(page.get('Welcome')).toBeVisible();
	 * await expect(page.get('Error')).not.toBeVisible();
	 * ```
	 */
	async toBeVisible(options?: MatcherOptions): Promise<void> {
		const timeout = options?.timeout ?? DEFAULT_ASSERTION_TIMEOUT;
		const isNot = this._not;

		await retry(
			`element to ${isNot ? 'not ' : ''}be visible`,
			async () => {
				const visible = await this.element.isVisible();
				return isNot ? !visible : visible;
			},
			(pass) => {
				if (!pass) {
					return `Expected element ${isNot ? 'not ' : ''}to be visible`;
				}
				return null;
			},
			timeout,
		);
	}

	/**
	 * Assert the element is hidden (not visible).
	 *
	 * ```ts
	 * await expect(page.get('Loading')).toBeHidden();
	 * ```
	 */
	async toBeHidden(options?: MatcherOptions): Promise<void> {
		const timeout = options?.timeout ?? DEFAULT_ASSERTION_TIMEOUT;
		const isNot = this._not;

		await retry(
			`element to ${isNot ? 'not ' : ''}be hidden`,
			async () => {
				const visible = await this.element.isVisible();
				const hidden = !visible;
				return isNot ? !hidden : hidden;
			},
			(pass) => {
				if (!pass) {
					return `Expected element ${isNot ? 'not ' : ''}to be hidden`;
				}
				return null;
			},
			timeout,
		);
	}

	/**
	 * Assert the element's text content matches exactly.
	 *
	 * ```ts
	 * await expect(page.get('h1')).toHaveText('Welcome');
	 * await expect(page.get('.count')).toHaveText(/\d+ items/);
	 * ```
	 */
	async toHaveText(expected: string | RegExp, options?: MatcherOptions): Promise<void> {
		const timeout = options?.timeout ?? DEFAULT_ASSERTION_TIMEOUT;
		const isNot = this._not;
		let lastActual = '';

		await retry(
			`element to ${isNot ? 'not ' : ''}have text "${expected}"`,
			async () => {
				const actual = (await this.element.textContent()).trim();
				lastActual = actual;
				const matches = typeof expected === 'string' ? actual === expected : expected.test(actual);
				return isNot ? !matches : matches;
			},
			(pass) => {
				if (!pass) {
					return `Expected element ${isNot ? 'not ' : ''}to have text "${expected}", but got "${lastActual}"`;
				}
				return null;
			},
			timeout,
		);
	}

	/**
	 * Assert the element's text content contains the expected substring.
	 *
	 * ```ts
	 * await expect(page.get('.message')).toContainText('success');
	 * ```
	 */
	async toContainText(expected: string | RegExp, options?: MatcherOptions): Promise<void> {
		const timeout = options?.timeout ?? DEFAULT_ASSERTION_TIMEOUT;
		const isNot = this._not;
		let lastActual = '';

		await retry(
			`element to ${isNot ? 'not ' : ''}contain text "${expected}"`,
			async () => {
				const actual = (await this.element.textContent()).trim();
				lastActual = actual;
				const matches =
					typeof expected === 'string' ? actual.includes(expected) : expected.test(actual);
				return isNot ? !matches : matches;
			},
			(pass) => {
				if (!pass) {
					return `Expected element ${isNot ? 'not ' : ''}to contain text "${expected}", but got "${lastActual}"`;
				}
				return null;
			},
			timeout,
		);
	}

	/**
	 * Assert the number of matching elements.
	 *
	 * ```ts
	 * await expect(page.get('li')).toHaveCount(5);
	 * ```
	 */
	async toHaveCount(expected: number, options?: MatcherOptions): Promise<void> {
		const timeout = options?.timeout ?? DEFAULT_ASSERTION_TIMEOUT;
		const isNot = this._not;
		let lastCount = 0;

		await retry(
			`element count to ${isNot ? 'not ' : ''}be ${expected}`,
			async () => {
				const count = await this.element.count();
				lastCount = count;
				const matches = count === expected;
				return isNot ? !matches : matches;
			},
			(pass) => {
				if (!pass) {
					return `Expected ${isNot ? 'not ' : ''}${expected} elements, but found ${lastCount}`;
				}
				return null;
			},
			timeout,
		);
	}

	/**
	 * Assert the element has a specific attribute value.
	 *
	 * ```ts
	 * await expect(page.get('input')).toHaveAttribute('type', 'email');
	 * await expect(page.get('a')).toHaveAttribute('href', /login/);
	 * ```
	 */
	async toHaveAttribute(
		name: string,
		expected?: string | RegExp,
		options?: MatcherOptions,
	): Promise<void> {
		const timeout = options?.timeout ?? DEFAULT_ASSERTION_TIMEOUT;
		const isNot = this._not;
		let lastValue: string | null = null;

		await retry(
			`element to ${isNot ? 'not ' : ''}have attribute "${name}"${expected !== undefined ? `="${expected}"` : ''}`,
			async () => {
				const value = await this.element.getAttribute(name);
				lastValue = value;

				if (expected === undefined) {
					// Just checking the attribute exists
					const has = value !== null;
					return isNot ? !has : has;
				}

				if (value === null) {
					return isNot; // no value -- pass if negated, fail otherwise
				}

				const matches = typeof expected === 'string' ? value === expected : expected.test(value);
				return isNot ? !matches : matches;
			},
			(pass) => {
				if (!pass) {
					if (expected === undefined) {
						return `Expected element ${isNot ? 'not ' : ''}to have attribute "${name}"`;
					}
					return `Expected attribute "${name}" ${isNot ? 'not ' : ''}to be "${expected}", but got "${lastValue}"`;
				}
				return null;
			},
			timeout,
		);
	}

	/**
	 * Assert an input/textarea/select has a specific value.
	 *
	 * ```ts
	 * await expect(page.get('Email')).toHaveValue('user@test.com');
	 * ```
	 */
	async toHaveValue(expected: string | RegExp, options?: MatcherOptions): Promise<void> {
		const timeout = options?.timeout ?? DEFAULT_ASSERTION_TIMEOUT;
		const isNot = this._not;
		let lastValue = '';

		await retry(
			`element to ${isNot ? 'not ' : ''}have value "${expected}"`,
			async () => {
				// Get value using script evaluation
				const located = await this.element.locate(timeout);
				const ref = located.node.sharedId
					? { sharedId: located.node.sharedId, handle: located.node.handle }
					: null;

				if (!ref) return false;

				const result = await this.element.page.session.script.callFunction({
					functionDeclaration: 'function(el) { return el.value ?? ""; }',
					target: { context: this.element.page.contextId },
					arguments: [ref],
					awaitPromise: false,
				});

				const value =
					result.type === 'success' && result.result?.type === 'string'
						? (result.result as { value: string }).value
						: '';
				lastValue = value;

				const matches = typeof expected === 'string' ? value === expected : expected.test(value);
				return isNot ? !matches : matches;
			},
			(pass) => {
				if (!pass) {
					return `Expected value ${isNot ? 'not ' : ''}to be "${expected}", but got "${lastValue}"`;
				}
				return null;
			},
			timeout,
		);
	}

	/**
	 * Assert a checkbox/radio is checked.
	 *
	 * ```ts
	 * await expect(page.get('Terms')).toBeChecked();
	 * await expect(page.get('Newsletter')).not.toBeChecked();
	 * ```
	 */
	async toBeChecked(options?: MatcherOptions): Promise<void> {
		const timeout = options?.timeout ?? DEFAULT_ASSERTION_TIMEOUT;
		const isNot = this._not;

		await retry(
			`element to ${isNot ? 'not ' : ''}be checked`,
			async () => {
				const located = await this.element.locate(timeout);
				const ref = located.node.sharedId
					? { sharedId: located.node.sharedId, handle: located.node.handle }
					: null;

				if (!ref) return false;

				const result = await this.element.page.session.script.callFunction({
					functionDeclaration: 'function(el) { return !!el.checked; }',
					target: { context: this.element.page.contextId },
					arguments: [ref],
					awaitPromise: false,
				});

				const checked =
					result.type === 'success' &&
					result.result?.type === 'boolean' &&
					(result.result as { value: boolean }).value === true;
				return isNot ? !checked : checked;
			},
			(pass) => {
				if (!pass) {
					return `Expected element ${isNot ? 'not ' : ''}to be checked`;
				}
				return null;
			},
			timeout,
		);
	}

	/**
	 * Assert an element is enabled (not disabled).
	 *
	 * ```ts
	 * await expect(page.get('Submit')).toBeEnabled();
	 * ```
	 */
	async toBeEnabled(options?: MatcherOptions): Promise<void> {
		const timeout = options?.timeout ?? DEFAULT_ASSERTION_TIMEOUT;
		const isNot = this._not;

		await retry(
			`element to ${isNot ? 'not ' : ''}be enabled`,
			async () => {
				const located = await this.element.locate(timeout);
				const ref = located.node.sharedId
					? { sharedId: located.node.sharedId, handle: located.node.handle }
					: null;

				if (!ref) return false;

				const result = await this.element.page.session.script.callFunction({
					functionDeclaration: 'function(el) { return !el.disabled; }',
					target: { context: this.element.page.contextId },
					arguments: [ref],
					awaitPromise: false,
				});

				const enabled =
					result.type === 'success' &&
					result.result?.type === 'boolean' &&
					(result.result as { value: boolean }).value === true;
				return isNot ? !enabled : enabled;
			},
			(pass) => {
				if (!pass) {
					return `Expected element ${isNot ? 'not ' : ''}to be enabled`;
				}
				return null;
			},
			timeout,
		);
	}

	/**
	 * Assert an element is disabled.
	 *
	 * ```ts
	 * await expect(page.get('Submit')).toBeDisabled();
	 * ```
	 */
	async toBeDisabled(options?: MatcherOptions): Promise<void> {
		const timeout = options?.timeout ?? DEFAULT_ASSERTION_TIMEOUT;
		const isNot = this._not;

		await retry(
			`element to ${isNot ? 'not ' : ''}be disabled`,
			async () => {
				const located = await this.element.locate(timeout);
				const ref = located.node.sharedId
					? { sharedId: located.node.sharedId, handle: located.node.handle }
					: null;

				if (!ref) return false;

				const result = await this.element.page.session.script.callFunction({
					functionDeclaration: 'function(el) { return !!el.disabled; }',
					target: { context: this.element.page.contextId },
					arguments: [ref],
					awaitPromise: false,
				});

				const disabled =
					result.type === 'success' &&
					result.result?.type === 'boolean' &&
					(result.result as { value: boolean }).value === true;
				return isNot ? !disabled : disabled;
			},
			(pass) => {
				if (!pass) {
					return `Expected element ${isNot ? 'not ' : ''}to be disabled`;
				}
				return null;
			},
			timeout,
		);
	}

	/**
	 * Assert an element has a specific CSS class.
	 *
	 * ```ts
	 * await expect(page.get('.alert')).toHaveClass('alert-success');
	 * ```
	 */
	async toHaveClass(expected: string | RegExp, options?: MatcherOptions): Promise<void> {
		const timeout = options?.timeout ?? DEFAULT_ASSERTION_TIMEOUT;
		const isNot = this._not;
		let lastClasses = '';

		await retry(
			`element to ${isNot ? 'not ' : ''}have class "${expected}"`,
			async () => {
				const classes = (await this.element.getAttribute('class')) ?? '';
				lastClasses = classes;

				const matches =
					typeof expected === 'string'
						? classes.split(/\s+/).includes(expected)
						: expected.test(classes);
				return isNot ? !matches : matches;
			},
			(pass) => {
				if (!pass) {
					return `Expected element ${isNot ? 'not ' : ''}to have class "${expected}", but got "${lastClasses}"`;
				}
				return null;
			},
			timeout,
		);
	}

	/**
	 * Assert an element has a specific CSS property value.
	 *
	 * ```ts
	 * await expect(page.get('.banner')).toHaveCSS('color', 'rgb(255, 0, 0)');
	 * await expect(page.get('.box')).toHaveCSS('display', 'flex');
	 * ```
	 */
	async toHaveCSS(
		property: string,
		expected: string | RegExp,
		options?: MatcherOptions,
	): Promise<void> {
		const timeout = options?.timeout ?? DEFAULT_ASSERTION_TIMEOUT;
		const isNot = this._not;
		let lastValue = '';

		await retry(
			`element to ${isNot ? 'not ' : ''}have CSS "${property}: ${expected}"`,
			async () => {
				const located = await this.element.locate(timeout);
				const ref = located.node.sharedId
					? { sharedId: located.node.sharedId, handle: located.node.handle }
					: null;

				if (!ref) return false;

				const result = await this.element.page.session.script.callFunction({
					functionDeclaration:
						'function(el, prop) { return window.getComputedStyle(el).getPropertyValue(prop); }',
					target: { context: this.element.page.contextId },
					arguments: [ref, { type: 'string', value: property }],
					awaitPromise: false,
				});

				const value =
					result.type === 'success' && result.result?.type === 'string'
						? (result.result as { value: string }).value
						: '';
				lastValue = value;

				const matches = typeof expected === 'string' ? value === expected : expected.test(value);
				return isNot ? !matches : matches;
			},
			(pass) => {
				if (!pass) {
					return `Expected CSS "${property}" ${isNot ? 'not ' : ''}to be "${expected}", but got "${lastValue}"`;
				}
				return null;
			},
			timeout,
		);
	}

	/**
	 * Assert an element has a specific id attribute.
	 *
	 * ```ts
	 * await expect(page.get('Submit')).toHaveId('submit-btn');
	 * ```
	 */
	async toHaveId(expected: string, options?: MatcherOptions): Promise<void> {
		const timeout = options?.timeout ?? DEFAULT_ASSERTION_TIMEOUT;
		const isNot = this._not;
		let lastId: string | null = null;

		await retry(
			`element to ${isNot ? 'not ' : ''}have id "${expected}"`,
			async () => {
				const id = await this.element.getAttribute('id');
				lastId = id;
				const matches = id === expected;
				return isNot ? !matches : matches;
			},
			(pass) => {
				if (!pass) {
					return `Expected element ${isNot ? 'not ' : ''}to have id "${expected}", but got "${lastId}"`;
				}
				return null;
			},
			timeout,
		);
	}

	/**
	 * Assert an element has a specific placeholder text.
	 *
	 * ```ts
	 * await expect(page.get({ selector: '#email' })).toHavePlaceholder('Enter your email');
	 * ```
	 */
	async toHavePlaceholder(expected: string | RegExp, options?: MatcherOptions): Promise<void> {
		const timeout = options?.timeout ?? DEFAULT_ASSERTION_TIMEOUT;
		const isNot = this._not;
		let lastPlaceholder: string | null = null;

		await retry(
			`element to ${isNot ? 'not ' : ''}have placeholder "${expected}"`,
			async () => {
				const placeholder = await this.element.getAttribute('placeholder');
				lastPlaceholder = placeholder;

				if (placeholder === null) return isNot;

				const matches =
					typeof expected === 'string' ? placeholder === expected : expected.test(placeholder);
				return isNot ? !matches : matches;
			},
			(pass) => {
				if (!pass) {
					return `Expected placeholder ${isNot ? 'not ' : ''}to be "${expected}", but got "${lastPlaceholder}"`;
				}
				return null;
			},
			timeout,
		);
	}

	/**
	 * Assert an element has a specific ARIA role.
	 *
	 * ```ts
	 * await expect(page.get('Submit')).toHaveRole('button');
	 * ```
	 */
	async toHaveRole(expected: string, options?: MatcherOptions): Promise<void> {
		const timeout = options?.timeout ?? DEFAULT_ASSERTION_TIMEOUT;
		const isNot = this._not;
		let lastRole = '';

		await retry(
			`element to ${isNot ? 'not ' : ''}have role "${expected}"`,
			async () => {
				const located = await this.element.locate(timeout);
				const ref = located.node.sharedId
					? { sharedId: located.node.sharedId, handle: located.node.handle }
					: null;

				if (!ref) return false;

				// Try explicit role attribute first, fall back to computed role
				const result = await this.element.page.session.script.callFunction({
					functionDeclaration: `function(el) {
						return el.getAttribute('role') || el.computedRole || '';
					}`,
					target: { context: this.element.page.contextId },
					arguments: [ref],
					awaitPromise: false,
				});

				const role =
					result.type === 'success' && result.result?.type === 'string'
						? (result.result as { value: string }).value
						: '';
				lastRole = role;

				const matches = role === expected;
				return isNot ? !matches : matches;
			},
			(pass) => {
				if (!pass) {
					return `Expected element ${isNot ? 'not ' : ''}to have role "${expected}", but got "${lastRole}"`;
				}
				return null;
			},
			timeout,
		);
	}
}

// ---------------------------------------------------------------------------
// Retry engine for assertions
// ---------------------------------------------------------------------------

/**
 * Retry an assertion until it passes or times out.
 * Unlike waitFor(), this produces a proper assertion error message.
 */
async function retry(
	description: string,
	check: () => Promise<boolean>,
	formatError: (lastResult: boolean) => string | null,
	timeout: number,
): Promise<void> {
	const interval = 100;
	const startTime = Date.now();
	let lastResult = false;

	while (Date.now() - startTime < timeout) {
		try {
			lastResult = await check();
			if (lastResult) return; // Assertion passed
		} catch {
			// Check threw -- will retry
			lastResult = false;
		}
		await new Promise((r) => setTimeout(r, interval));
	}

	// Final check
	try {
		lastResult = await check();
		if (lastResult) return;
	} catch {
		lastResult = false;
	}

	const errorMsg = formatError(lastResult) ?? `Assertion failed: ${description}`;
	throw new AssertionError(errorMsg);
}

// ---------------------------------------------------------------------------
// Custom assertion error
// ---------------------------------------------------------------------------

/**
 * Error thrown when an assertion fails.
 */
export class AssertionError extends Error {
	readonly name = 'AssertionError';
}
