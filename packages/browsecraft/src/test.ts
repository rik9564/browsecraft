// ============================================================================
// Browsecraft - Test Function
// The core test authoring API. Uses fixture injection to provide page, browser, etc.
//
// import { test, expect } from 'browsecraft';
//
// test('user can log in', async ({ page }) => {
//   await page.goto('/login');
//   await page.fill('Email', 'user@test.com');
//   await page.fill('Password', 'secret');
//   await page.click('Sign In');
//   await expect(page).toHaveURL('/dashboard');
// });
// ============================================================================

import { Browser, BrowserContext } from './browser.js';
import { Page } from './page.js';
import type { UserConfig } from './config.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Fixtures available in every test */
export interface TestFixtures {
	/** A fresh page in a new browser context. Auto-closed after the test. */
	page: Page;
	/** The browser context for this test. */
	context: BrowserContext;
	/** The browser instance (shared across tests in a worker). */
	browser: Browser;
}

/** A single test case, registered by test() */
export interface TestCase {
	/** Test title */
	title: string;
	/** The test function */
	fn: (fixtures: TestFixtures) => Promise<void>;
	/** Test options */
	options: TestOptions;
	/** File this test was defined in */
	file?: string;
	/** Suite/describe path (e.g., ['Login', 'form validation']) */
	suitePath: string[];
	/** Whether this test is skipped */
	skip: boolean;
	/** Whether only this test should run */
	only: boolean;
}

/** Options for individual tests */
export interface TestOptions {
	/** Override timeout for this specific test */
	timeout?: number;
	/** Number of retries for this specific test */
	retries?: number;
	/** Tags for filtering (e.g., ['smoke', 'regression']) */
	tags?: string[];
}

/** Internal test registry -- the runner reads from here */
export const testRegistry: TestCase[] = [];

/** Current suite stack for describe() nesting */
const suiteStack: string[] = [];

// ---------------------------------------------------------------------------
// test() -- the main API
// ---------------------------------------------------------------------------

/**
 * Define a browser test.
 *
 * ```ts
 * import { test, expect } from 'browsecraft';
 *
 * test('user can log in', async ({ page }) => {
 *   await page.goto('/login');
 *   await page.fill('Email', 'user@test.com');
 *   await page.fill('Password', 'secret');
 *   await page.click('Sign In');
 *   await expect(page).toHaveURL('/dashboard');
 * });
 * ```
 */
export function test(title: string, fn: (fixtures: TestFixtures) => Promise<void>): void;
export function test(title: string, options: TestOptions, fn: (fixtures: TestFixtures) => Promise<void>): void;
export function test(
	title: string,
	fnOrOptions: ((fixtures: TestFixtures) => Promise<void>) | TestOptions,
	maybeFn?: (fixtures: TestFixtures) => Promise<void>,
): void {
	const fn = typeof fnOrOptions === 'function' ? fnOrOptions : maybeFn!;
	const options = typeof fnOrOptions === 'function' ? {} : fnOrOptions;

	testRegistry.push({
		title,
		fn,
		options,
		suitePath: [...suiteStack],
		skip: false,
		only: false,
	});
}

/**
 * Skip a test.
 *
 * ```ts
 * test.skip('broken test', async ({ page }) => { ... });
 * ```
 */
test.skip = function skipTest(
	title: string,
	fn: (fixtures: TestFixtures) => Promise<void>,
): void {
	testRegistry.push({
		title,
		fn,
		options: {},
		suitePath: [...suiteStack],
		skip: true,
		only: false,
	});
};

/**
 * Only run this test (skip all others).
 *
 * ```ts
 * test.only('focused test', async ({ page }) => { ... });
 * ```
 */
test.only = function onlyTest(
	title: string,
	fn: (fixtures: TestFixtures) => Promise<void>,
): void {
	testRegistry.push({
		title,
		fn,
		options: {},
		suitePath: [...suiteStack],
		skip: false,
		only: true,
	});
};

// ---------------------------------------------------------------------------
// describe() -- grouping tests
// ---------------------------------------------------------------------------

/**
 * Group related tests together.
 *
 * ```ts
 * describe('Login', () => {
 *   test('shows form', async ({ page }) => { ... });
 *   test('validates email', async ({ page }) => { ... });
 * });
 * ```
 */
export function describe(title: string, fn: () => void): void {
	suiteStack.push(title);
	fn();
	suiteStack.pop();
}

/**
 * Skip a describe block.
 */
describe.skip = function skipDescribe(title: string, fn: () => void): void {
	suiteStack.push(title);
	// Register all tests inside as skipped
	const startIndex = testRegistry.length;
	fn();
	for (let i = startIndex; i < testRegistry.length; i++) {
		testRegistry[i]!.skip = true;
	}
	suiteStack.pop();
};

/**
 * Only run tests in this describe block.
 */
describe.only = function onlyDescribe(title: string, fn: () => void): void {
	suiteStack.push(title);
	const startIndex = testRegistry.length;
	fn();
	for (let i = startIndex; i < testRegistry.length; i++) {
		testRegistry[i]!.only = true;
	}
	suiteStack.pop();
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Before/after hooks for a describe block */
export type HookFn = (fixtures: TestFixtures) => Promise<void>;

const hooks = {
	beforeAll: [] as Array<{ fn: HookFn; suitePath: string[] }>,
	afterAll: [] as Array<{ fn: HookFn; suitePath: string[] }>,
	beforeEach: [] as Array<{ fn: HookFn; suitePath: string[] }>,
	afterEach: [] as Array<{ fn: HookFn; suitePath: string[] }>,
};

/**
 * Run before all tests in the current describe block.
 */
export function beforeAll(fn: HookFn): void {
	hooks.beforeAll.push({ fn, suitePath: [...suiteStack] });
}

/**
 * Run after all tests in the current describe block.
 */
export function afterAll(fn: HookFn): void {
	hooks.afterAll.push({ fn, suitePath: [...suiteStack] });
}

/**
 * Run before each test in the current describe block.
 */
export function beforeEach(fn: HookFn): void {
	hooks.beforeEach.push({ fn, suitePath: [...suiteStack] });
}

/**
 * Run after each test in the current describe block.
 */
export function afterEach(fn: HookFn): void {
	hooks.afterEach.push({ fn, suitePath: [...suiteStack] });
}

/** Get hooks for a test (used by the runner) */
export function getHooks() {
	return { ...hooks };
}

// ---------------------------------------------------------------------------
// Internal: Run a single test with fixtures
// ---------------------------------------------------------------------------

/**
 * Execute a single test case with proper fixture setup/teardown.
 * This is called by the test runner.
 */
export async function runTest(
	testCase: TestCase,
	sharedBrowser?: Browser,
): Promise<TestResult> {
	const startTime = Date.now();

	if (testCase.skip) {
		return {
			title: testCase.title,
			suitePath: testCase.suitePath,
			status: 'skipped',
			duration: 0,
		};
	}

	let browser: Browser | undefined;
	let context: BrowserContext | undefined;
	let page: Page | undefined;

	try {
		// Use shared browser if provided, otherwise launch a new one
		browser = sharedBrowser ?? await Browser.launch();
		context = await browser.newContext();
		page = await context.newPage();

		const fixtures: TestFixtures = { page, context, browser };

		// Run beforeEach hooks
		const applicableBeforeEach = hooks.beforeEach.filter(h =>
			isHookApplicable(h.suitePath, testCase.suitePath),
		);
		for (const hook of applicableBeforeEach) {
			await hook.fn(fixtures);
		}

		// Run the test
		const timeout = testCase.options.timeout ?? 30_000;
		await Promise.race([
			testCase.fn(fixtures),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error(`Test timed out after ${timeout}ms`)), timeout),
			),
		]);

		// Run afterEach hooks
		const applicableAfterEach = hooks.afterEach.filter(h =>
			isHookApplicable(h.suitePath, testCase.suitePath),
		);
		for (const hook of applicableAfterEach) {
			await hook.fn(fixtures);
		}

		const duration = Date.now() - startTime;
		return {
			title: testCase.title,
			suitePath: testCase.suitePath,
			status: 'passed',
			duration,
		};
	} catch (error) {
		const duration = Date.now() - startTime;
		return {
			title: testCase.title,
			suitePath: testCase.suitePath,
			status: 'failed',
			duration,
			error: error instanceof Error ? error : new Error(String(error)),
		};
	} finally {
		// Clean up context (page is closed when context closes)
		await context?.close().catch(() => {});
		// Only close browser if we launched it
		if (!sharedBrowser && browser) {
			await browser.close().catch(() => {});
		}
	}
}

/** Check if a hook applies to a test based on suite nesting */
function isHookApplicable(hookSuitePath: string[], testSuitePath: string[]): boolean {
	if (hookSuitePath.length === 0) return true; // Global hook applies to all
	if (hookSuitePath.length > testSuitePath.length) return false;
	return hookSuitePath.every((s, i) => testSuitePath[i] === s);
}

/** Result of running a single test */
export interface TestResult {
	title: string;
	suitePath: string[];
	status: 'passed' | 'failed' | 'skipped';
	duration: number;
	error?: Error;
}
