#!/usr/bin/env node

// ============================================================================
// Browsecraft BDD Demo — Sauce Labs (Swag Labs) E2E Test
//
// Demonstrates the full BDD pipeline:
//   1. Parse a .feature file
//   2. Register step definitions using Given/When/Then
//   3. Wire up the BDD executor with a real browser
//   4. Run and report results
//
// Usage:
//   node tests/bdd-saucelabs.mjs
//   node tests/bdd-saucelabs.mjs --tags "@smoke"
//   node tests/bdd-saucelabs.mjs --tags "@login and not @negative"
// ============================================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Import from compiled dist (tests run against the published artifact)
import { Browser } from '../packages/browsecraft/dist/index.js';
import {
	parseGherkin,
	Given, When, Then,
	BddExecutor,
	globalRegistry,
} from '../packages/browsecraft-bdd/dist/index.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://www.saucedemo.com';
const DEFAULT_PASSWORD = 'secret_sauce';
const STEP_TIMEOUT = 30_000;

const PASS = '\x1b[32m\u2713\x1b[0m';
const FAIL = '\x1b[31m\u2717\x1b[0m';
const SKIP = '\x1b[33m-\x1b[0m';
const PEND = '\x1b[36m?\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';

// ---------------------------------------------------------------------------
// Step Definitions
// ---------------------------------------------------------------------------

Given('I am on the Swag Labs login page', async (world) => {
	const page = /** @type {import('../packages/browsecraft/dist/index.js').Page} */ (world.page);
	await page.goto(BASE_URL);
	// Clear any existing cart/session state from localStorage
	// (Sauce Labs stores cart state in localStorage, shared across tabs)
	await page.evaluate('window.localStorage.clear(); window.sessionStorage.clear();');
	// Wait for the login form to render (React SPA)
	await page.waitForSelector({ selector: '[data-test="username"]' });
});

When('I fill {string} with {string}', async (world, field, value) => {
	const page = /** @type {import('../packages/browsecraft/dist/index.js').Page} */ (world.page);

	// Map human-readable field names to data-test attributes for reliability
	// (Sauce Labs uses data-test attributes on all form elements)
	const fieldMap = {
		'Username': '[data-test="username"]',
		'Password': '[data-test="password"]',
		'First Name': '[data-test="firstName"]',
		'Last Name': '[data-test="lastName"]',
		'Zip/Postal Code': '[data-test="postalCode"]',
	};

	const selector = fieldMap[field];
	if (selector) {
		await page.fill({ selector }, value);
	} else {
		// Fallback: try browsecraft's smart locator (label/placeholder matching)
		await page.fill(field, value);
	}
});

When('I click {string}', async (world, text) => {
	const page = /** @type {import('../packages/browsecraft/dist/index.js').Page} */ (world.page);

	// Map button text to reliable selectors for Sauce Labs
	const clickMap = {
		'Login': '[data-test="login-button"]',
		'Checkout': '[data-test="checkout"]',
		'Continue': '[data-test="continue"]',
		'Finish': '[data-test="finish"]',
		'Continue Shopping': '[data-test="continue-shopping"]',
	};

	// Buttons that trigger navigation — wait for URL change after click
	const navWait = {
		'Continue': 'checkout-step-two',
		'Finish': 'checkout-complete',
	};

	const selector = clickMap[text];
	if (selector) {
		await page.click({ selector });
		// If this button triggers a navigation, wait for it
		if (navWait[text]) {
			await page.waitForURL(navWait[text]);
		}
	} else {
		// Use browsecraft's smart text-based locator
		await page.click(text);
	}
});

When('I login as {string}', async (world, username) => {
	const page = /** @type {import('../packages/browsecraft/dist/index.js').Page} */ (world.page);
	await page.fill({ selector: '[data-test="username"]' }, username);
	await page.fill({ selector: '[data-test="password"]' }, DEFAULT_PASSWORD);
	await page.click({ selector: '[data-test="login-button"]' });
	// Wait for inventory page to load and products to render
	await page.waitForURL('inventory');
	await page.waitForSelector({ selector: '[data-test="inventory-list"]' });
});

When('I click {string} on the first product', async (world, action) => {
	const page = /** @type {import('../packages/browsecraft/dist/index.js').Page} */ (world.page);
	if (action === 'Add to cart') {
		// Click the first "Add to cart" button on the inventory page
		await page.click({ selector: '[data-test="add-to-cart-sauce-labs-backpack"]' });
	} else if (action === 'Remove') {
		await page.click({ selector: '[data-test="remove-sauce-labs-backpack"]' });
	} else {
		throw new Error(`Unknown action for first product: "${action}"`);
	}
});

When('I click {string} on the second product', async (world, action) => {
	const page = /** @type {import('../packages/browsecraft/dist/index.js').Page} */ (world.page);
	if (action === 'Add to cart') {
		await page.click({ selector: '[data-test="add-to-cart-sauce-labs-bike-light"]' });
	} else if (action === 'Remove') {
		await page.click({ selector: '[data-test="remove-sauce-labs-bike-light"]' });
	} else {
		throw new Error(`Unknown action for second product: "${action}"`);
	}
});

When('I go to the cart', async (world) => {
	const page = /** @type {import('../packages/browsecraft/dist/index.js').Page} */ (world.page);
	await page.click({ selector: '[data-test="shopping-cart-link"]' });
	await page.waitForURL('cart');
});

Then('I should be on the inventory page', async (world) => {
	const page = /** @type {import('../packages/browsecraft/dist/index.js').Page} */ (world.page);
	const url = await page.url();
	if (!url.includes('inventory')) {
		throw new Error(`Expected URL to contain "inventory", got: ${url}`);
	}
});

Then('I should be on the cart page', async (world) => {
	const page = /** @type {import('../packages/browsecraft/dist/index.js').Page} */ (world.page);
	const url = await page.url();
	if (!url.includes('cart')) {
		throw new Error(`Expected URL to contain "cart", got: ${url}`);
	}
});

Then('I should be on the checkout overview page', async (world) => {
	const page = /** @type {import('../packages/browsecraft/dist/index.js').Page} */ (world.page);
	const url = await page.url();
	if (!url.includes('checkout-step-two')) {
		throw new Error(`Expected URL to contain "checkout-step-two", got: ${url}`);
	}
});

Then('I should see {string}', async (world, text) => {
	const page = /** @type {import('../packages/browsecraft/dist/index.js').Page} */ (world.page);
	const content = await page.content();
	if (!content.includes(text)) {
		throw new Error(`Expected page to contain "${text}" but it did not`);
	}
});

Then('I should see an error message containing {string}', async (world, text) => {
	const page = /** @type {import('../packages/browsecraft/dist/index.js').Page} */ (world.page);
	// Wait for the error container to appear
	await page.waitForSelector({ selector: '[data-test="error"]' });
	const errorText = await page.innerText({ selector: '[data-test="error"]' });
	if (!errorText.includes(text)) {
		throw new Error(`Expected error to contain "${text}", got: "${errorText}"`);
	}
});

Then('the cart badge should show {string}', async (world, count) => {
	const page = /** @type {import('../packages/browsecraft/dist/index.js').Page} */ (world.page);
	await page.waitForSelector({ selector: '[data-test="shopping-cart-badge"]' });
	const badgeText = await page.innerText({ selector: '[data-test="shopping-cart-badge"]' });
	if (badgeText.trim() !== count) {
		throw new Error(`Expected cart badge to show "${count}", got: "${badgeText.trim()}"`);
	}
});

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function main() {
	// Parse CLI args
	const args = process.argv.slice(2);
	let tagFilter = undefined;
	for (let i = 0; i < args.length; i++) {
		if (args[i] === '--tags' && args[i + 1]) {
			tagFilter = args[i + 1];
			i++;
		}
	}

	console.log(`\n${BOLD}============================================${RESET}`);
	console.log(`${BOLD}  Browsecraft BDD — Sauce Labs Demo${RESET}`);
	console.log(`${BOLD}============================================${RESET}`);
	if (tagFilter) {
		console.log(`  Tag filter: ${CYAN}${tagFilter}${RESET}`);
	}
	console.log();

	// 1. Read and parse the .feature file
	const __dirname = dirname(fileURLToPath(import.meta.url));
	const featureSource = readFileSync(
		join(__dirname, 'features', 'saucelabs.feature'),
		'utf-8',
	);
	const document = parseGherkin(featureSource, 'saucelabs.feature');

	console.log(`  ${DIM}Parsed: ${document.feature?.name ?? 'unknown'}${RESET}`);
	const scenarioCount = document.feature?.children?.filter(c => 'scenario' in c).length ?? 0;
	console.log(`  ${DIM}Scenarios: ${scenarioCount}${RESET}\n`);

	// 2. Launch browser
	let browser;
	let exitCode = 0;

	try {
		browser = await Browser.launch({
			browser: 'chrome',
			headless: true,
		});
		console.log(`  ${PASS} Browser launched (headless Chrome)\n`);

		// 3. Create executor with world factory that provides fresh page per scenario
		const executor = new BddExecutor({
			registry: globalRegistry,
			tagFilter,
			stepTimeout: STEP_TIMEOUT,
			failFast: false,
			worldFactory: async () => {
				const page = await browser.newPage();
				// Clear cookies so each scenario starts with clean state
				// (Sauce Labs stores cart state in cookies/session)
				await page.clearCookies();
				return {
					page,
					browser,
					ctx: {},
					attach: () => {},
					log: (msg) => console.log(`      ${DIM}[log] ${msg}${RESET}`),
				};
			},
			onScenarioStart: (scenario) => {
				console.log(`  ${BOLD}Scenario: ${scenario.name}${RESET}`);
			},
			onStepEnd: (result) => {
				const icon = result.status === 'passed' ? PASS
					: result.status === 'failed' ? FAIL
					: result.status === 'skipped' ? SKIP
					: result.status === 'undefined' ? `${RED}?${RESET}`
					: PEND;
				const duration = result.duration > 0 ? ` ${DIM}(${result.duration}ms)${RESET}` : '';
				console.log(`    ${icon} ${result.keyword} ${result.text}${duration}`);
				if (result.error && result.status !== 'skipped') {
					const msg = result.error.message.split('\n')[0];
					console.log(`      ${RED}${msg}${RESET}`);
				}
			},
			onScenarioEnd: (result) => {
				const statusColor = result.status === 'passed' ? GREEN
					: result.status === 'failed' ? RED
					: result.status === 'skipped' ? YELLOW
					: CYAN;
				console.log(`    ${statusColor}=> ${result.status}${RESET} ${DIM}(${result.duration}ms)${RESET}\n`);
			},
		});

		// 4. Run!
		const result = await executor.runDocument(document);

		// 5. Cleanup — close all open pages
		for (const page of browser.openPages) {
			await page.close().catch(() => {});
		}

		// 6. Print summary
		const { summary } = result;
		console.log(`${BOLD}============================================${RESET}`);
		console.log(`  Features:  ${summary.features.passed} passed, ${summary.features.failed} failed, ${summary.features.total} total`);
		console.log(`  Scenarios: ${GREEN}${summary.scenarios.passed} passed${RESET}, ${RED}${summary.scenarios.failed} failed${RESET}, ${YELLOW}${summary.scenarios.skipped} skipped${RESET}, ${summary.scenarios.total} total`);
		console.log(`  Steps:     ${GREEN}${summary.steps.passed} passed${RESET}, ${RED}${summary.steps.failed} failed${RESET}, ${YELLOW}${summary.steps.skipped} skipped${RESET}, ${summary.steps.undefined} undefined, ${summary.steps.total} total`);
		console.log(`  Duration:  ${(result.duration / 1000).toFixed(1)}s`);
		console.log(`${BOLD}============================================${RESET}\n`);

		if (summary.scenarios.failed > 0 || summary.steps.undefined > 0) {
			exitCode = 1;
		}
	} catch (err) {
		console.error(`\n  ${FAIL} Fatal error: ${err.message}`);
		if (err.stack) {
			console.error(`    ${err.stack.split('\n').slice(1, 4).join('\n    ')}`);
		}
		exitCode = 1;
	} finally {
		if (browser) {
			await browser.close().catch(() => {});
		}
	}

	process.exit(exitCode);
}

main();
