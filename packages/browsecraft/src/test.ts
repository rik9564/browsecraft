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

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Browser, type BrowserContext } from './browser.js';
import { resolveConfig } from './config.js';
import type { UserConfig } from './config.js';
import type { Page } from './page.js';

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

/** Track which beforeAll hooks have already been executed */
const executedBeforeAllHooks = new Set<string>();

/** Track which afterAll hooks have already been executed */
const executedAfterAllHooks = new Set<string>();

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
export function test(
	title: string,
	options: TestOptions,
	fn: (fixtures: TestFixtures) => Promise<void>,
): void;
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
test.skip = function skipTest(title: string, fn: (fixtures: TestFixtures) => Promise<void>): void {
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
test.only = function onlyTest(title: string, fn: (fixtures: TestFixtures) => Promise<void>): void {
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
	userConfig?: UserConfig,
): Promise<TestResult> {
	const startTime = Date.now();
	const config = resolveConfig(userConfig);

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
		browser = sharedBrowser ?? (await Browser.launch());
		context = await browser.newContext();
		page = await context.newPage();

		const fixtures: TestFixtures = { page, context, browser };

		// Run beforeAll hooks (only for hooks that haven't been run yet for this suite)
		const applicableBeforeAll = hooks.beforeAll.filter((h) =>
			isHookApplicable(h.suitePath, testCase.suitePath),
		);
		for (const hook of applicableBeforeAll) {
			const hookKey = `${hook.suitePath.join('>')}:${hooks.beforeAll.indexOf(hook)}`;
			if (!executedBeforeAllHooks.has(hookKey)) {
				await hook.fn(fixtures);
				executedBeforeAllHooks.add(hookKey);
			}
		}

		// Run beforeEach hooks
		const applicableBeforeEach = hooks.beforeEach.filter((h) =>
			isHookApplicable(h.suitePath, testCase.suitePath),
		);
		for (const hook of applicableBeforeEach) {
			await hook.fn(fixtures);
		}

		// Run the test
		const timeout = testCase.options.timeout ?? config.timeout;
		await Promise.race([
			testCase.fn(fixtures),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error(`Test timed out after ${timeout}ms`)), timeout),
			),
		]);

		// Run afterEach hooks
		const applicableAfterEach = hooks.afterEach.filter((h) =>
			isHookApplicable(h.suitePath, testCase.suitePath),
		);
		for (const hook of applicableAfterEach) {
			await hook.fn(fixtures);
		}

		// Take screenshot on success if config says 'always'
		let screenshotPath: string | undefined;
		if (config.screenshot === 'always' && page) {
			screenshotPath = await captureScreenshot(page, testCase, config.outputDir).catch(
				() => undefined,
			);
		}

		const duration = Date.now() - startTime;
		return {
			title: testCase.title,
			suitePath: testCase.suitePath,
			status: 'passed',
			duration,
			screenshotPath,
		};
	} catch (error) {
		const duration = Date.now() - startTime;

		// Capture screenshot on failure if configured
		let screenshotPath: string | undefined;
		if ((config.screenshot === 'on-failure' || config.screenshot === 'always') && page) {
			screenshotPath = await captureScreenshot(page, testCase, config.outputDir).catch(
				() => undefined,
			);
		}

		return {
			title: testCase.title,
			suitePath: testCase.suitePath,
			status: 'failed',
			duration,
			error: error instanceof Error ? error : new Error(String(error)),
			screenshotPath,
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

/**
 * Run afterAll hooks for the given suite path.
 * Called by the runner after all tests in a suite have completed.
 */
export async function runAfterAllHooks(suitePath: string[], fixtures: TestFixtures): Promise<void> {
	const applicableAfterAll = hooks.afterAll.filter((h) => isHookApplicable(h.suitePath, suitePath));
	for (const hook of applicableAfterAll) {
		const hookKey = `${hook.suitePath.join('>')}:${hooks.afterAll.indexOf(hook)}`;
		if (!executedAfterAllHooks.has(hookKey)) {
			await hook.fn(fixtures);
			executedAfterAllHooks.add(hookKey);
		}
	}
}

/**
 * Reset all hooks and registries (for test isolation between files).
 */
export function resetTestState(): void {
	testRegistry.length = 0;
	hooks.beforeAll.length = 0;
	hooks.afterAll.length = 0;
	hooks.beforeEach.length = 0;
	hooks.afterEach.length = 0;
	executedBeforeAllHooks.clear();
	executedAfterAllHooks.clear();
	suiteStack.length = 0;
}

/** Check if a hook applies to a test based on suite nesting */
function isHookApplicable(hookSuitePath: string[], testSuitePath: string[]): boolean {
	if (hookSuitePath.length === 0) return true; // Global hook applies to all
	if (hookSuitePath.length > testSuitePath.length) return false;
	return hookSuitePath.every((s, i) => testSuitePath[i] === s);
}

/** Capture a screenshot and save it to the output directory */
async function captureScreenshot(
	page: Page,
	testCase: TestCase,
	outputDir: string,
): Promise<string> {
	// Build a safe filename from suite path + test title
	const parts = [...testCase.suitePath, testCase.title];
	const safeName = parts
		.join('-')
		.replace(/[^a-zA-Z0-9_-]/g, '_')
		.replace(/_+/g, '_')
		.slice(0, 200);
	const timestamp = Date.now();
	const filename = `${safeName}-${timestamp}.png`;
	const screenshotDir = join(outputDir, 'screenshots');

	// Ensure directory exists
	await mkdir(screenshotDir, { recursive: true });

	// Capture and save
	const buffer = await page.screenshot();
	const filePath = join(screenshotDir, filename);
	await writeFile(filePath, buffer);

	return filePath;
}

/** Result of running a single test */
export interface TestResult {
	title: string;
	suitePath: string[];
	status: 'passed' | 'failed' | 'skipped';
	duration: number;
	error?: Error;
	/** Path to screenshot file (if captured on failure) */
	screenshotPath?: string;
}
