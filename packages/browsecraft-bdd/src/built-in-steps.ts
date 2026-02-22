// ============================================================================
// Built-in Step Definitions — ready-to-use Gherkin steps for Browsecraft.
//
// Users get these out of the box so they can write .feature files without
// defining every common step manually. Just call registerBuiltInSteps()
// or import 'browsecraft-bdd/built-in-steps' and you're good.
//
// Every step reads like plain English:
//   Given I am on "https://example.com"
//   When I click "Submit"
//   Then I should see "Welcome"
//
// The page object comes from world.page (injected by the executor's
// worldFactory). These steps cast it to `any` because the BDD package
// doesn't depend on the core `browsecraft` package.
// ============================================================================

import { type StepFunction, type StepRegistry, globalRegistry } from './step-registry.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get the page from the world, throwing if not available */
function getPage(world: { page: unknown }): any {
	if (!world.page) {
		throw new Error(
			'Built-in steps require world.page to be set. ' +
				'Pass a worldFactory to your BddExecutor that provides a Page instance.',
		);
	}
	return world.page;
}

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

interface StepEntry {
	type: 'Given' | 'When' | 'Then' | 'Any';
	pattern: string;
	fn: StepFunction;
}

const steps: StepEntry[] = [
	// =======================================================================
	// Navigation
	// =======================================================================
	{
		type: 'Given',
		pattern: 'I am on {string}',
		fn: async (world, url) => {
			const page = getPage(world);
			await page.goto(url as string);
		},
	},
	{
		type: 'Given',
		pattern: 'I navigate to {string}',
		fn: async (world, url) => {
			const page = getPage(world);
			await page.goto(url as string);
		},
	},
	{
		type: 'Given',
		pattern: 'I go to {string}',
		fn: async (world, url) => {
			const page = getPage(world);
			await page.goto(url as string);
		},
	},
	{
		type: 'When',
		pattern: 'I reload the page',
		fn: async (world) => {
			const page = getPage(world);
			await page.reload();
		},
	},
	{
		type: 'When',
		pattern: 'I go back',
		fn: async (world) => {
			const page = getPage(world);
			await page.goBack();
		},
	},
	{
		type: 'When',
		pattern: 'I go forward',
		fn: async (world) => {
			const page = getPage(world);
			await page.goForward();
		},
	},

	// =======================================================================
	// Click / Interaction
	// =======================================================================
	{
		type: 'When',
		pattern: 'I click {string}',
		fn: async (world, target) => {
			const page = getPage(world);
			await page.click(target as string);
		},
	},
	{
		type: 'When',
		pattern: 'I click the {string} button',
		fn: async (world, name) => {
			const page = getPage(world);
			await page.click(name as string);
		},
	},
	{
		type: 'When',
		pattern: 'I double click {string}',
		fn: async (world, target) => {
			const page = getPage(world);
			await page.dblclick(target as string);
		},
	},
	{
		type: 'When',
		pattern: 'I hover over {string}',
		fn: async (world, target) => {
			const page = getPage(world);
			await page.hover(target as string);
		},
	},
	{
		type: 'When',
		pattern: 'I tap {string}',
		fn: async (world, target) => {
			const page = getPage(world);
			await page.tap(target as string);
		},
	},
	{
		type: 'When',
		pattern: 'I focus on {string}',
		fn: async (world, target) => {
			const page = getPage(world);
			await page.focus(target as string);
		},
	},

	// =======================================================================
	// Form input
	// =======================================================================
	{
		type: 'When',
		pattern: 'I fill {string} with {string}',
		fn: async (world, target, value) => {
			const page = getPage(world);
			await page.fill(target as string, value as string);
		},
	},
	{
		type: 'When',
		pattern: 'I type {string} into {string}',
		fn: async (world, text, target) => {
			const page = getPage(world);
			await page.type(target as string, text as string);
		},
	},
	{
		type: 'When',
		pattern: 'I clear {string}',
		fn: async (world, target) => {
			const page = getPage(world);
			await page.fill(target as string, '');
		},
	},
	{
		type: 'When',
		pattern: 'I select {string} from {string}',
		fn: async (world, value, target) => {
			const page = getPage(world);
			await page.select(target as string, value as string);
		},
	},
	{
		type: 'When',
		pattern: 'I check {string}',
		fn: async (world, target) => {
			const page = getPage(world);
			await page.check(target as string);
		},
	},
	{
		type: 'When',
		pattern: 'I uncheck {string}',
		fn: async (world, target) => {
			const page = getPage(world);
			await page.uncheck(target as string);
		},
	},

	// =======================================================================
	// Keyboard
	// =======================================================================
	{
		type: 'When',
		pattern: 'I press {string}',
		fn: async (world, key) => {
			const page = getPage(world);
			await page.press(key as string);
		},
	},

	// =======================================================================
	// Visibility assertions
	// =======================================================================
	{
		type: 'Then',
		pattern: 'I should see {string}',
		fn: async (world, text) => {
			const page = getPage(world);
			await page.see(text as string);
		},
	},
	{
		type: 'Then',
		pattern: 'I see {string}',
		fn: async (world, text) => {
			const page = getPage(world);
			await page.see(text as string);
		},
	},
	{
		type: 'Then',
		pattern: 'I should not see {string}',
		fn: async (world, text) => {
			const page = getPage(world);
			await page.waitForSelector(text as string, { state: 'hidden', timeout: 5000 });
		},
	},

	// =======================================================================
	// URL assertions
	// =======================================================================
	{
		type: 'Then',
		pattern: 'the URL should contain {string}',
		fn: async (world, expected) => {
			const page = getPage(world);
			const url = await page.url();
			if (!url.includes(expected as string)) {
				throw new Error(`Expected URL to contain "${expected}", got "${url}"`);
			}
		},
	},
	{
		type: 'Then',
		pattern: 'the URL should be {string}',
		fn: async (world, expected) => {
			const page = getPage(world);
			const url = await page.url();
			if (url !== expected) {
				throw new Error(`Expected URL to be "${expected}", got "${url}"`);
			}
		},
	},

	// =======================================================================
	// Title assertions
	// =======================================================================
	{
		type: 'Then',
		pattern: 'the title should be {string}',
		fn: async (world, expected) => {
			const page = getPage(world);
			const title = await page.title();
			if (title !== expected) {
				throw new Error(`Expected title to be "${expected}", got "${title}"`);
			}
		},
	},
	{
		type: 'Then',
		pattern: 'the title should contain {string}',
		fn: async (world, expected) => {
			const page = getPage(world);
			const title = await page.title();
			if (!title.includes(expected as string)) {
				throw new Error(`Expected title to contain "${expected}", got "${title}"`);
			}
		},
	},

	// =======================================================================
	// Text content assertions
	// =======================================================================
	{
		type: 'Then',
		pattern: '{string} should have text {string}',
		fn: async (world, target, expected) => {
			const page = getPage(world);
			const text = await page.innerText(target as string);
			if (text !== expected) {
				throw new Error(`Expected "${target}" to have text "${expected}", got "${text}"`);
			}
		},
	},
	{
		type: 'Then',
		pattern: '{string} should contain text {string}',
		fn: async (world, target, expected) => {
			const page = getPage(world);
			const text = await page.innerText(target as string);
			if (!text.includes(expected as string)) {
				throw new Error(`Expected "${target}" to contain text "${expected}", got "${text}"`);
			}
		},
	},

	// =======================================================================
	// Input value assertions
	// =======================================================================
	{
		type: 'Then',
		pattern: '{string} should have value {string}',
		fn: async (world, target, expected) => {
			const page = getPage(world);
			const value = await page.inputValue(target as string);
			if (value !== expected) {
				throw new Error(`Expected "${target}" to have value "${expected}", got "${value}"`);
			}
		},
	},

	// =======================================================================
	// Waiting
	// =======================================================================
	{
		type: 'When',
		pattern: 'I wait for {string}',
		fn: async (world, target) => {
			const page = getPage(world);
			await page.waitForSelector(target as string);
		},
	},
	{
		type: 'When',
		pattern: 'I wait for {string} to disappear',
		fn: async (world, target) => {
			const page = getPage(world);
			await page.waitForSelector(target as string, { state: 'hidden' });
		},
	},
	{
		type: 'When',
		pattern: 'I wait {int} seconds',
		fn: async (_world, seconds) => {
			await new Promise((r) => setTimeout(r, (seconds as number) * 1000));
		},
	},

	// =======================================================================
	// Screenshots
	// =======================================================================
	{
		type: 'When',
		pattern: 'I take a screenshot',
		fn: async (world) => {
			const page = getPage(world);
			const buffer = await page.screenshot();
			world.attach(buffer.toString('base64'), 'image/png');
		},
	},

	// =======================================================================
	// Dialogs
	// =======================================================================
	{
		type: 'When',
		pattern: 'I accept the dialog',
		fn: async (world) => {
			const page = getPage(world);
			await page.acceptDialog();
		},
	},
	{
		type: 'When',
		pattern: 'I dismiss the dialog',
		fn: async (world) => {
			const page = getPage(world);
			await page.dismissDialog();
		},
	},

	// =======================================================================
	// Cookies
	// =======================================================================
	{
		type: 'When',
		pattern: 'I clear all cookies',
		fn: async (world) => {
			const page = getPage(world);
			await page.clearCookies();
		},
	},

	// =======================================================================
	// Drag and drop
	// =======================================================================
	{
		type: 'When',
		pattern: 'I drag {string} to {string}',
		fn: async (world, source, dest) => {
			const page = getPage(world);
			await page.dragTo(source as string, dest as string);
		},
	},

	// =======================================================================
	// JavaScript evaluation
	// =======================================================================
	{
		type: 'When',
		pattern: 'I execute {string}',
		fn: async (world, script) => {
			const page = getPage(world);
			await page.evaluate(script as string);
		},
	},
];

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/** Whether built-in steps have been registered on the global registry */
let registered = false;

/**
 * Register all built-in step definitions on a registry.
 *
 * If no registry is provided, uses the global registry.
 * Safe to call multiple times — only registers once per registry.
 *
 * ```ts
 * import { registerBuiltInSteps } from 'browsecraft-bdd';
 * registerBuiltInSteps();
 * ```
 */
export function registerBuiltInSteps(registry?: StepRegistry): void {
	const target = registry ?? globalRegistry;

	// Avoid double-registration on the global registry
	if (target === globalRegistry && registered) return;

	for (const step of steps) {
		target.register(step.type, step.pattern, step.fn);
	}

	if (target === globalRegistry) {
		registered = true;
	}
}

/**
 * Get the list of all built-in step patterns (for documentation / reporting).
 */
export function getBuiltInStepPatterns(): Array<{
	type: 'Given' | 'When' | 'Then' | 'Any';
	pattern: string;
}> {
	return steps.map((s) => ({ type: s.type, pattern: s.pattern }));
}
