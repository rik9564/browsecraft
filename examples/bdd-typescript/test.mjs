#!/usr/bin/env node

// ============================================================================
// Browsecraft BDD — TypeScript-Native Example
//
// This example shows Browsecraft's TypeScript-native BDD mode.
// Instead of .feature files, you write BDD directly in JavaScript/TypeScript
// using feature(), scenario(), given(), when(), then().
//
// Why use this over .feature files?
//   - Full IDE autocomplete and type checking
//   - No separate file to maintain
//   - Refactoring support (rename, find references)
//   - Steps are inline — no matching/glue code needed
//   - Same structured output as Gherkin mode
//
// Usage:
//   node test.mjs                   # run all scenarios
//   node test.mjs --tags "@smoke"   # only @smoke scenarios
//   node test.mjs --headed          # watch it run
//   node test.mjs --headed --max    # full screen
// ============================================================================

import { Browser } from 'browsecraft';
import {
	feature, scenario, given, when, then, and, but,
	runFeatures,
} from 'browsecraft-bdd';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://www.saucedemo.com';
const DEFAULT_PASSWORD = 'secret_sauce';

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
const SKIP = '\x1b[33m-\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';

// ---------------------------------------------------------------------------
// Helper: login
// ---------------------------------------------------------------------------

async function login(page, username = 'standard_user') {
	await page.goto(BASE_URL);
	await page.evaluate('window.localStorage.clear(); window.sessionStorage.clear();');
	await page.waitForSelector({ selector: '[data-test="username"]' });
	await page.fill({ selector: '[data-test="username"]' }, username);
	await page.fill({ selector: '[data-test="password"]' }, DEFAULT_PASSWORD);
	await page.click({ selector: '[data-test="login-button"]' });
	await page.waitForURL('inventory');
	await page.waitForSelector({ selector: '[data-test="inventory-list"]' });
}

// ---------------------------------------------------------------------------
// Feature 1: Login
// ---------------------------------------------------------------------------

feature(['@saucelabs'], 'Sauce Labs Login', () => {

	scenario(['@smoke', '@login'], 'Successful login with standard user', ({ page }) => {
		given('I am on the Swag Labs login page', async () => {
			await page.goto(BASE_URL);
			await page.evaluate('window.localStorage.clear();');
			await page.waitForSelector({ selector: '[data-test="username"]' });
		});

		when('I fill in valid credentials', async () => {
			await page.fill({ selector: '[data-test="username"]' }, 'standard_user');
			await page.fill({ selector: '[data-test="password"]' }, DEFAULT_PASSWORD);
		});

		and('I click the login button', async () => {
			await page.click({ selector: '[data-test="login-button"]' });
		});

		then('I should see the products page', async () => {
			await page.waitForURL('inventory');
			const content = await page.content();
			if (!content.includes('Products')) {
				throw new Error('Expected to see "Products" on the page');
			}
		});
	});

	scenario(['@login', '@negative'], 'Login fails with invalid credentials', ({ page }) => {
		given('I am on the login page', async () => {
			await page.goto(BASE_URL);
			await page.waitForSelector({ selector: '[data-test="username"]' });
		});

		when('I enter invalid credentials', async () => {
			await page.fill({ selector: '[data-test="username"]' }, 'bad_user');
			await page.fill({ selector: '[data-test="password"]' }, 'wrong');
			await page.click({ selector: '[data-test="login-button"]' });
		});

		then('I should see an error message', async () => {
			await page.waitForSelector({ selector: '[data-test="error"]' });
			const errorText = await page.innerText({ selector: '[data-test="error"]' });
			if (!errorText.includes('Username and password do not match')) {
				throw new Error(`Expected error about invalid credentials, got: "${errorText}"`);
			}
		});
	});

});

// ---------------------------------------------------------------------------
// Feature 2: Shopping Cart
// ---------------------------------------------------------------------------

feature(['@saucelabs'], 'Sauce Labs Shopping Cart', () => {

	scenario(['@smoke', '@cart'], 'Add item to cart', ({ page }) => {
		given('I am logged in', async () => {
			await login(page);
		});

		when('I add the first product to the cart', async () => {
			await page.click({ selector: '[data-test="add-to-cart-sauce-labs-backpack"]' });
		});

		then('the cart badge should show 1', async () => {
			await page.waitForSelector({ selector: '[data-test="shopping-cart-badge"]' });
			const badge = await page.innerText({ selector: '[data-test="shopping-cart-badge"]' });
			if (badge.trim() !== '1') {
				throw new Error(`Expected cart badge "1", got "${badge.trim()}"`);
			}
		});
	});

	scenario(['@cart'], 'Add and remove items', ({ page }) => {
		given('I am logged in', async () => {
			await login(page);
		});

		when('I add two products to the cart', async () => {
			await page.click({ selector: '[data-test="add-to-cart-sauce-labs-backpack"]' });
			await page.click({ selector: '[data-test="add-to-cart-sauce-labs-bike-light"]' });
		});

		then('the cart badge should show 2', async () => {
			await page.waitForSelector({ selector: '[data-test="shopping-cart-badge"]' });
			const badge = await page.innerText({ selector: '[data-test="shopping-cart-badge"]' });
			if (badge.trim() !== '2') {
				throw new Error(`Expected cart badge "2", got "${badge.trim()}"`);
			}
		});

		when('I remove the first product', async () => {
			await page.click({ selector: '[data-test="remove-sauce-labs-backpack"]' });
		});

		then('the cart badge should show 1', async () => {
			const badge = await page.innerText({ selector: '[data-test="shopping-cart-badge"]' });
			if (badge.trim() !== '1') {
				throw new Error(`Expected cart badge "1", got "${badge.trim()}"`);
			}
		});
	});

});

// ---------------------------------------------------------------------------
// Feature 3: Checkout
// ---------------------------------------------------------------------------

feature(['@saucelabs'], 'Sauce Labs Checkout', () => {

	scenario(['@smoke', '@checkout'], 'Complete checkout flow', ({ page }) => {
		given('I am logged in with an item in my cart', async () => {
			await login(page);
			await page.click({ selector: '[data-test="add-to-cart-sauce-labs-backpack"]' });
		});

		when('I go to the cart and start checkout', async () => {
			await page.click({ selector: '[data-test="shopping-cart-link"]' });
			await page.waitForURL('cart');
			await page.click({ selector: '[data-test="checkout"]' });
		});

		and('I fill in my shipping information', async () => {
			await page.fill({ selector: '[data-test="firstName"]' }, 'John');
			await page.fill({ selector: '[data-test="lastName"]' }, 'Doe');
			await page.fill({ selector: '[data-test="postalCode"]' }, '12345');
			await page.click({ selector: '[data-test="continue"]' });
			await page.waitForURL('checkout-step-two');
		});

		and('I finish the order', async () => {
			await page.click({ selector: '[data-test="finish"]' });
			await page.waitForURL('checkout-complete');
		});

		then('I should see a confirmation message', async () => {
			const content = await page.content();
			if (!content.includes('Thank you for your order!')) {
				throw new Error('Expected "Thank you for your order!"');
			}
		});
	});

	scenario(['@smoke', '@navigation'], 'Navigate to cart and back', ({ page }) => {
		given('I am logged in', async () => {
			await login(page);
		});

		when('I go to the cart', async () => {
			await page.click({ selector: '[data-test="shopping-cart-link"]' });
			await page.waitForURL('cart');
		});

		then('I should be on the cart page', async () => {
			const url = await page.url();
			if (!url.includes('cart')) {
				throw new Error(`Expected URL to contain "cart", got: ${url}`);
			}
		});

		when('I click Continue Shopping', async () => {
			await page.click({ selector: '[data-test="continue-shopping"]' });
		});

		then('I should be back on the inventory page', async () => {
			const url = await page.url();
			if (!url.includes('inventory')) {
				throw new Error(`Expected URL to contain "inventory", got: ${url}`);
			}
		});
	});

});

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function main() {
	// Parse CLI args
	const args = process.argv.slice(2);
	let tagFilter = undefined;
	let headed = false;
	let maximized = false;
	for (let i = 0; i < args.length; i++) {
		if (args[i] === '--tags' && args[i + 1]) {
			tagFilter = args[i + 1];
			i++;
		} else if (args[i] === '--headed') {
			headed = true;
		} else if (args[i] === '--maximized' || args[i] === '--max') {
			maximized = true;
			headed = true;
		}
	}

	console.log(`\n${BOLD}============================================${RESET}`);
	console.log(`${BOLD}  Browsecraft BDD — TypeScript-Native${RESET}`);
	console.log(`${BOLD}============================================${RESET}`);
	if (tagFilter) {
		console.log(`  Tag filter: ${CYAN}${tagFilter}${RESET}`);
	}
	console.log();

	// Launch browser
	let browser;
	let exitCode = 0;

	try {
		browser = await Browser.launch({
			browser: 'chrome',
			headless: !headed,
			maximized,
		});
		const mode = headed ? (maximized ? 'headed maximized' : 'headed') : 'headless';
		console.log(`  ${PASS} Browser launched (${mode} Chrome)\n`);

		// Run all collected features
		const result = await runFeatures({
			tagFilter,
			stepTimeout: 30_000,
			failFast: false,
			worldFactory: async () => {
				const page = await browser.newPage();
				await page.clearCookies();
				return {
					page,
					browser,
					ctx: {},
					attach: () => {},
					log: (msg) => console.log(`      ${DIM}[log] ${msg}${RESET}`),
				};
			},
		});

		// Close all pages
		for (const page of browser.openPages) {
			await page.close().catch(() => {});
		}

		// Print results
		for (const feat of result.features) {
			console.log(`  ${BOLD}Feature: ${feat.name}${RESET}`);
			for (const sc of feat.scenarios) {
				const scenarioIcon = sc.status === 'passed' ? PASS
					: sc.status === 'failed' ? FAIL
					: SKIP;
				console.log(`    ${scenarioIcon} ${sc.name} ${DIM}(${sc.duration}ms)${RESET}`);

				for (const step of sc.steps) {
					const stepIcon = step.status === 'passed' ? PASS
						: step.status === 'failed' ? FAIL
						: step.status === 'skipped' ? SKIP
						: SKIP;
					console.log(`      ${stepIcon} ${step.keyword} ${step.text} ${DIM}(${step.duration}ms)${RESET}`);
					if (step.error) {
						console.log(`        ${RED}${step.error.message.split('\n')[0]}${RESET}`);
					}
				}
			}
			console.log();
		}

		// Summary
		const { summary } = result;
		console.log(`${BOLD}============================================${RESET}`);
		console.log(`  Features:  ${summary.features.passed} passed, ${summary.features.failed} failed, ${summary.features.total} total`);
		console.log(`  Scenarios: ${GREEN}${summary.scenarios.passed} passed${RESET}, ${RED}${summary.scenarios.failed} failed${RESET}, ${YELLOW}${summary.scenarios.skipped} skipped${RESET}, ${summary.scenarios.total} total`);
		console.log(`  Steps:     ${GREEN}${summary.steps.passed} passed${RESET}, ${RED}${summary.steps.failed} failed${RESET}, ${YELLOW}${summary.steps.skipped} skipped${RESET}, ${summary.steps.total} total`);
		console.log(`  Duration:  ${(result.duration / 1000).toFixed(1)}s`);
		console.log(`${BOLD}============================================${RESET}\n`);

		if (summary.scenarios.failed > 0) {
			exitCode = 1;
		}
	} catch (err) {
		console.error(`\n  ${FAIL} Fatal error: ${err.message}`);
		exitCode = 1;
	} finally {
		if (browser) {
			await browser.close().catch(() => {});
		}
	}

	process.exit(exitCode);
}

main();
