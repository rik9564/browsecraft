#!/usr/bin/env node

// ============================================================================
// Browsecraft BDD — Classic Gherkin Example
//
// This example demonstrates Browsecraft's built-in BDD framework using
// .feature files (Gherkin syntax) with step definitions in JavaScript.
//
// How it works:
//   1. Write scenarios in plain English (.feature files)
//   2. Register step definitions with Given/When/Then
//   3. The BDD executor matches steps to definitions and runs them
//
// This is similar to Cucumber.js, but built into Browsecraft — no extra
// dependencies, no configuration files, no test runner setup.
//
// Usage:
//   node test.mjs                                   # run all scenarios
//   node test.mjs --tags "@smoke"                   # only @smoke scenarios
//   node test.mjs --tags "@login and not @negative" # tag expressions
//   node test.mjs --headed                          # watch it run
//   node test.mjs --headed --maximized              # full screen
// ============================================================================

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Browser } from 'browsecraft';
import { BddExecutor, Given, Then, When, globalRegistry, parseGherkin } from 'browsecraft-bdd';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://www.saucedemo.com';
const DEFAULT_PASSWORD = 'secret_sauce';
const STEP_TIMEOUT = 30_000;

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
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
// Each step definition matches a line in the .feature file.
// {string} captures a quoted string. The `world` object gives you the page.

Given('I am on the Swag Labs login page', async (world) => {
	const page = world.page;
	await page.goto(BASE_URL);
	await page.evaluate('window.localStorage.clear(); window.sessionStorage.clear();');
	await page.waitForSelector({ selector: '[data-test="username"]' });
});

When('I fill {string} with {string}', async (world, field, value) => {
	const page = world.page;

	// Map human-readable names to selectors. This keeps .feature files clean.
	const fieldMap = {
		Username: '[data-test="username"]',
		Password: '[data-test="password"]',
		'First Name': '[data-test="firstName"]',
		'Last Name': '[data-test="lastName"]',
		'Zip/Postal Code': '[data-test="postalCode"]',
	};

	const selector = fieldMap[field];
	if (selector) {
		await page.fill({ selector }, value);
	} else {
		// Fallback: let Browsecraft find the field by label/placeholder text
		await page.fill(field, value);
	}
});

When('I click {string}', async (world, text) => {
	const page = world.page;

	const clickMap = {
		Login: '[data-test="login-button"]',
		Checkout: '[data-test="checkout"]',
		Continue: '[data-test="continue"]',
		Finish: '[data-test="finish"]',
		'Continue Shopping': '[data-test="continue-shopping"]',
	};

	const navWait = {
		Continue: 'checkout-step-two',
		Finish: 'checkout-complete',
	};

	const selector = clickMap[text];
	if (selector) {
		await page.click({ selector });
		if (navWait[text]) {
			await page.waitForURL(navWait[text]);
		}
	} else {
		await page.click(text);
	}
});

When('I login as {string}', async (world, username) => {
	const page = world.page;
	await page.fill({ selector: '[data-test="username"]' }, username);
	await page.fill({ selector: '[data-test="password"]' }, DEFAULT_PASSWORD);
	await page.click({ selector: '[data-test="login-button"]' });
	await page.waitForURL('inventory');
	await page.waitForSelector({ selector: '[data-test="inventory-list"]' });
});

When('I click {string} on the first product', async (world, action) => {
	const page = world.page;
	if (action === 'Add to cart') {
		await page.click({ selector: '[data-test="add-to-cart-sauce-labs-backpack"]' });
	} else if (action === 'Remove') {
		await page.click({ selector: '[data-test="remove-sauce-labs-backpack"]' });
	} else {
		throw new Error(`Unknown action: "${action}"`);
	}
});

When('I click {string} on the second product', async (world, action) => {
	const page = world.page;
	if (action === 'Add to cart') {
		await page.click({ selector: '[data-test="add-to-cart-sauce-labs-bike-light"]' });
	} else if (action === 'Remove') {
		await page.click({ selector: '[data-test="remove-sauce-labs-bike-light"]' });
	} else {
		throw new Error(`Unknown action: "${action}"`);
	}
});

When('I go to the cart', async (world) => {
	const page = world.page;
	await page.click({ selector: '[data-test="shopping-cart-link"]' });
	await page.waitForURL('cart');
});

Then('I should be on the inventory page', async (world) => {
	const url = await world.page.url();
	if (!url.includes('inventory')) {
		throw new Error(`Expected URL to contain "inventory", got: ${url}`);
	}
});

Then('I should be on the cart page', async (world) => {
	const url = await world.page.url();
	if (!url.includes('cart')) {
		throw new Error(`Expected URL to contain "cart", got: ${url}`);
	}
});

Then('I should be on the checkout overview page', async (world) => {
	const url = await world.page.url();
	if (!url.includes('checkout-step-two')) {
		throw new Error(`Expected URL to contain "checkout-step-two", got: ${url}`);
	}
});

Then('I should see {string}', async (world, text) => {
	const content = await world.page.content();
	if (!content.includes(text)) {
		throw new Error(`Expected page to contain "${text}" but it did not`);
	}
});

Then('I should see an error message containing {string}', async (world, text) => {
	const page = world.page;
	await page.waitForSelector({ selector: '[data-test="error"]' });
	const errorText = await page.innerText({ selector: '[data-test="error"]' });
	if (!errorText.includes(text)) {
		throw new Error(`Expected error "${text}", got: "${errorText}"`);
	}
});

Then('the cart badge should show {string}', async (world, count) => {
	const page = world.page;
	await page.waitForSelector({ selector: '[data-test="shopping-cart-badge"]' });
	const badgeText = await page.innerText({ selector: '[data-test="shopping-cart-badge"]' });
	if (badgeText.trim() !== count) {
		throw new Error(`Expected cart badge "${count}", got: "${badgeText.trim()}"`);
	}
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
	console.log(`${BOLD}  Browsecraft BDD — Gherkin Example${RESET}`);
	console.log(`${BOLD}============================================${RESET}`);
	if (tagFilter) {
		console.log(`  Tag filter: ${CYAN}${tagFilter}${RESET}`);
	}
	console.log();

	// 1. Read and parse the .feature file
	const __dirname = dirname(fileURLToPath(import.meta.url));
	const featureSource = readFileSync(join(__dirname, 'features', 'saucelabs.feature'), 'utf-8');
	const document = parseGherkin(featureSource, 'saucelabs.feature');

	console.log(`  ${DIM}Parsed: ${document.feature?.name ?? 'unknown'}${RESET}`);
	const scenarioCount = document.feature?.children?.filter((c) => 'scenario' in c).length ?? 0;
	console.log(`  ${DIM}Scenarios: ${scenarioCount}${RESET}\n`);

	// 2. Launch browser
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

		// 3. Create the BDD executor
		//    worldFactory creates a fresh page for each scenario
		const executor = new BddExecutor({
			registry: globalRegistry,
			tagFilter,
			stepTimeout: STEP_TIMEOUT,
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
			onScenarioStart: (scenario) => {
				console.log(`  ${BOLD}Scenario: ${scenario.name}${RESET}`);
			},
			onStepEnd: (result) => {
				const icon =
					result.status === 'passed'
						? PASS
						: result.status === 'failed'
							? FAIL
							: result.status === 'skipped'
								? SKIP
								: result.status === 'undefined'
									? `${RED}?${RESET}`
									: PEND;
				const duration = result.duration > 0 ? ` ${DIM}(${result.duration}ms)${RESET}` : '';
				console.log(`    ${icon} ${result.keyword} ${result.text}${duration}`);
				if (result.error && result.status !== 'skipped') {
					const msg = result.error.message.split('\n')[0];
					console.log(`      ${RED}${msg}${RESET}`);
				}
			},
			onScenarioEnd: (result) => {
				const statusColor =
					result.status === 'passed'
						? GREEN
						: result.status === 'failed'
							? RED
							: result.status === 'skipped'
								? YELLOW
								: CYAN;
				console.log(
					`    ${statusColor}=> ${result.status}${RESET} ${DIM}(${result.duration}ms)${RESET}\n`,
				);
			},
		});

		// 4. Run!
		const result = await executor.runDocument(document);

		// 5. Close all pages
		for (const page of browser.openPages) {
			await page.close().catch(() => {});
		}

		// 6. Print summary
		const { summary } = result;
		console.log(`${BOLD}============================================${RESET}`);
		console.log(
			`  Features:  ${summary.features.passed} passed, ${summary.features.failed} failed, ${summary.features.total} total`,
		);
		console.log(
			`  Scenarios: ${GREEN}${summary.scenarios.passed} passed${RESET}, ${RED}${summary.scenarios.failed} failed${RESET}, ${YELLOW}${summary.scenarios.skipped} skipped${RESET}, ${summary.scenarios.total} total`,
		);
		console.log(
			`  Steps:     ${GREEN}${summary.steps.passed} passed${RESET}, ${RED}${summary.steps.failed} failed${RESET}, ${YELLOW}${summary.steps.skipped} skipped${RESET}, ${summary.steps.undefined} undefined, ${summary.steps.total} total`,
		);
		console.log(`  Duration:  ${(result.duration / 1000).toFixed(1)}s`);
		console.log(`${BOLD}============================================${RESET}\n`);

		if (summary.scenarios.failed > 0 || summary.steps.undefined > 0) {
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
