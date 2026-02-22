#!/usr/bin/env node

// ============================================================================
// Browsecraft — Getting Started Example
//
// This example shows how to use Browsecraft for simple browser automation
// against the Sauce Labs demo app (https://www.saucedemo.com).
//
// No BDD, no frameworks — just launch a browser, interact with a page,
// and verify results. Like Playwright, but simpler.
//
// Usage:
//   node test.mjs              # headless (default)
//   node test.mjs --headed     # watch it run
//   node test.mjs --maximized  # headed + maximized window
// ============================================================================

import { Browser } from 'browsecraft';

// ---------------------------------------------------------------------------
// Parse CLI flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const headed = args.includes('--headed') || args.includes('--maximized');
const maximized = args.includes('--maximized') || args.includes('--max');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';

let passed = 0;
let failed = 0;

function assert(condition, message) {
	if (!condition) {
		throw new Error(`Assertion failed: ${message}`);
	}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function main() {
	console.log(`\n${BOLD}Browsecraft — Getting Started Example${RESET}\n`);

	const browser = await Browser.launch({
		browser: 'chrome',
		headless: !headed,
		maximized,
	});

	const mode = headed ? (maximized ? 'headed maximized' : 'headed') : 'headless';
	console.log(`  ${PASS} Browser launched (${mode} Chrome)\n`);

	try {
		// =====================================================================
		// Test 1: Login and verify the products page
		// =====================================================================
		try {
			const page = await browser.newPage();
			await page.goto('https://www.saucedemo.com');
			await page.clearCookies();
			await page.evaluate('window.localStorage.clear(); window.sessionStorage.clear();');

			// Verify we're on the login page
			const title = await page.title();
			assert(title.includes('Swag Labs'), `Expected title to include "Swag Labs", got "${title}"`);

			// Fill in credentials using data-test selectors
			await page.fill({ selector: '[data-test="username"]' }, 'standard_user');
			await page.fill({ selector: '[data-test="password"]' }, 'secret_sauce');

			// Click the login button
			await page.click({ selector: '[data-test="login-button"]' });

			// Wait for the inventory page
			await page.waitForURL('inventory');

			// Verify we see products
			const url = await page.url();
			assert(url.includes('inventory'), `Expected URL to contain "inventory", got: ${url}`);

			const content = await page.content();
			assert(content.includes('Products'), 'Expected page to contain "Products"');

			await page.close();
			console.log(`  ${PASS} Test 1: Login and verify products page`);
			passed++;
		} catch (err) {
			console.log(`  ${FAIL} Test 1: Login and verify products page`);
			console.log(`    ${RED}${err.message}${RESET}`);
			failed++;
		}

		// =====================================================================
		// Test 2: Add item to cart
		// =====================================================================
		try {
			const page = await browser.newPage();
			await page.goto('https://www.saucedemo.com');
			await page.clearCookies();
			await page.evaluate('window.localStorage.clear(); window.sessionStorage.clear();');

			// Quick login
			await page.fill({ selector: '[data-test="username"]' }, 'standard_user');
			await page.fill({ selector: '[data-test="password"]' }, 'secret_sauce');
			await page.click({ selector: '[data-test="login-button"]' });
			await page.waitForURL('inventory');

			// Add the first item to cart
			await page.click({ selector: '[data-test="add-to-cart-sauce-labs-backpack"]' });

			// Verify cart badge shows "1"
			await page.waitForSelector({ selector: '[data-test="shopping-cart-badge"]' });
			const badgeText = await page.innerText({ selector: '[data-test="shopping-cart-badge"]' });
			assert(badgeText.trim() === '1', `Expected cart badge "1", got "${badgeText.trim()}"`);

			await page.close();
			console.log(`  ${PASS} Test 2: Add item to cart`);
			passed++;
		} catch (err) {
			console.log(`  ${FAIL} Test 2: Add item to cart`);
			console.log(`    ${RED}${err.message}${RESET}`);
			failed++;
		}

		// =====================================================================
		// Test 3: Complete checkout flow
		// =====================================================================
		try {
			const page = await browser.newPage();
			await page.goto('https://www.saucedemo.com');
			await page.clearCookies();
			await page.evaluate('window.localStorage.clear(); window.sessionStorage.clear();');

			// Login
			await page.fill({ selector: '[data-test="username"]' }, 'standard_user');
			await page.fill({ selector: '[data-test="password"]' }, 'secret_sauce');
			await page.click({ selector: '[data-test="login-button"]' });
			await page.waitForURL('inventory');

			// Add item and go to cart
			await page.click({ selector: '[data-test="add-to-cart-sauce-labs-backpack"]' });
			await page.click({ selector: '[data-test="shopping-cart-link"]' });
			await page.waitForURL('cart');

			// Checkout
			await page.click({ selector: '[data-test="checkout"]' });

			// Fill checkout info
			await page.fill({ selector: '[data-test="firstName"]' }, 'John');
			await page.fill({ selector: '[data-test="lastName"]' }, 'Doe');
			await page.fill({ selector: '[data-test="postalCode"]' }, '12345');
			await page.click({ selector: '[data-test="continue"]' });
			await page.waitForURL('checkout-step-two');

			// Finish
			await page.click({ selector: '[data-test="finish"]' });
			await page.waitForURL('checkout-complete');

			// Verify success
			const content = await page.content();
			assert(content.includes('Thank you for your order!'), 'Expected "Thank you for your order!"');

			await page.close();
			console.log(`  ${PASS} Test 3: Complete checkout flow`);
			passed++;
		} catch (err) {
			console.log(`  ${FAIL} Test 3: Complete checkout flow`);
			console.log(`    ${RED}${err.message}${RESET}`);
			failed++;
		}

		// =====================================================================
		// Test 4: Screenshot and evaluate
		// =====================================================================
		try {
			const page = await browser.newPage();
			await page.goto('https://www.saucedemo.com');
			await page.clearCookies();
			await page.evaluate('window.localStorage.clear(); window.sessionStorage.clear();');

			// Take a screenshot (returns Buffer)
			const screenshot = await page.screenshot();
			assert(screenshot instanceof Buffer, 'Expected screenshot to be a Buffer');
			assert(screenshot.length > 1000, 'Expected screenshot to be > 1KB');

			// Evaluate JavaScript in the browser
			const inputCount = await page.evaluate('document.querySelectorAll("input").length');
			assert(inputCount >= 2, `Expected at least 2 inputs, got ${inputCount}`);

			await page.close();
			console.log(`  ${PASS} Test 4: Screenshot and evaluate`);
			passed++;
		} catch (err) {
			console.log(`  ${FAIL} Test 4: Screenshot and evaluate`);
			console.log(`    ${RED}${err.message}${RESET}`);
			failed++;
		}

		// =====================================================================
		// Test 5: Error handling — invalid login
		// =====================================================================
		try {
			const page = await browser.newPage();
			await page.goto('https://www.saucedemo.com');
			await page.clearCookies();
			await page.evaluate('window.localStorage.clear(); window.sessionStorage.clear();');

			await page.fill({ selector: '[data-test="username"]' }, 'bad_user');
			await page.fill({ selector: '[data-test="password"]' }, 'wrong');
			await page.click({ selector: '[data-test="login-button"]' });

			// Wait for error message
			await page.waitForSelector({ selector: '[data-test="error"]' });
			const errorText = await page.innerText({ selector: '[data-test="error"]' });
			assert(
				errorText.includes('Username and password do not match'),
				`Expected error message about invalid credentials, got: "${errorText}"`,
			);

			await page.close();
			console.log(`  ${PASS} Test 5: Error handling — invalid login`);
			passed++;
		} catch (err) {
			console.log(`  ${FAIL} Test 5: Error handling — invalid login`);
			console.log(`    ${RED}${err.message}${RESET}`);
			failed++;
		}
	} finally {
		await browser.close();
	}

	// Summary
	console.log(`\n${BOLD}────────────────────────────────${RESET}`);
	console.log(
		`  ${GREEN}${passed} passed${RESET}, ${failed > 0 ? RED : DIM}${failed} failed${RESET}`,
	);
	console.log(`${BOLD}────────────────────────────────${RESET}\n`);

	process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
	console.error(`\n${FAIL} Fatal error: ${err.message}`);
	process.exit(1);
});
