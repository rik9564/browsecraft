#!/usr/bin/env node

// ============================================================================
// Browsecraft Smoke Test
// Verifies the full stack works end-to-end: launcher -> transport -> session.
// Run: node tests/smoke.mjs
// ============================================================================

import {
	BddExecutor,
	StepRegistry,
	getBuiltInStepPatterns,
	globalRegistry,
	parseGherkin,
	registerBuiltInSteps,
} from '../packages/browsecraft-bdd/dist/index.js';
// We import from the compiled dist output to test what users will actually get
import { BiDiSession } from '../packages/browsecraft-bidi/dist/index.js';
import {
	BrowsecraftError,
	Browser,
	ElementNotActionableError,
	ElementNotFoundError,
	NetworkError,
	TimeoutError,
} from '../packages/browsecraft/dist/index.js';

import fs from 'node:fs';

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

let passed = 0;
let failed = 0;

function assert(condition, message) {
	if (condition) {
		console.log(`  ${PASS} ${message}`);
		passed++;
	} else {
		console.log(`  ${FAIL} ${message}`);
		failed++;
	}
}

function assertEq(actual, expected, message) {
	if (actual === expected) {
		console.log(`  ${PASS} ${message}`);
		passed++;
	} else {
		console.log(`  ${FAIL} ${message} — expected "${expected}", got "${actual}"`);
		failed++;
	}
}

// ============================================================================
// Test 1: Low-level BiDi Session
// ============================================================================

async function testBiDiSession() {
	console.log(`\n${BOLD}Test 1: BiDiSession (low-level)${RESET}`);

	let session;
	try {
		session = await BiDiSession.launch({
			browser: 'chrome',
			headless: true,
			timeout: 30_000,
		});
		assert(true, 'BiDiSession.launch() succeeded');
		assert(session.isConnected, 'Session is connected');

		// Create a browsing context (tab)
		const createResult = await session.browsingContext.create({ type: 'tab' });
		const contextId = createResult.context;
		assert(!!contextId, `Created browsing context: ${contextId}`);

		// Navigate to example.com
		const navResult = await session.browsingContext.navigate({
			context: contextId,
			url: 'https://example.com',
			wait: 'complete',
		});
		assert(!!navResult.url, `Navigated to: ${navResult.url}`);

		// Evaluate document.title
		const titleResult = await session.script.evaluate({
			expression: 'document.title',
			target: { context: contextId },
			awaitPromise: false,
		});
		const title =
			titleResult.type === 'success' && titleResult.result?.type === 'string'
				? titleResult.result.value
				: null;
		assertEq(title, 'Example Domain', `document.title = "${title}"`);

		// Evaluate document.querySelector('h1').textContent
		const h1Result = await session.script.evaluate({
			expression: 'document.querySelector("h1").textContent',
			target: { context: contextId },
			awaitPromise: false,
		});
		const h1 =
			h1Result.type === 'success' && h1Result.result?.type === 'string'
				? h1Result.result.value
				: null;
		assertEq(h1, 'Example Domain', `h1 text = "${h1}"`);

		// Take a screenshot
		const ssResult = await session.browsingContext.captureScreenshot({
			context: contextId,
		});
		assert(
			ssResult.data && ssResult.data.length > 100,
			`Screenshot captured (${ssResult.data.length} chars base64)`,
		);

		// Get the browsing context tree
		const tree = await session.browsingContext.getTree();
		assert(tree.contexts.length > 0, `Context tree has ${tree.contexts.length} context(s)`);

		// Close the browsing context
		await session.browsingContext.close({ context: contextId });
		assert(true, 'Closed browsing context');
	} catch (err) {
		console.log(`  ${FAIL} BiDiSession test threw: ${err.message}`);
		if (err.stack) console.log(`    ${err.stack.split('\n').slice(1, 3).join('\n    ')}`);
		failed++;
	} finally {
		if (session) {
			await session.close().catch(() => {});
			assert(true, 'Session closed');
		}
	}
}

// ============================================================================
// Test 2: High-level Browser + Page API
// ============================================================================

async function testBrowserAPI() {
	console.log(`\n${BOLD}Test 2: Browser + Page API (high-level)${RESET}`);

	let browser;
	try {
		browser = await Browser.launch({
			browser: 'chrome',
			headless: true,
		});
		assert(true, 'Browser.launch() succeeded');
		assert(browser.isConnected, 'Browser is connected');

		// Create a new page
		const page = await browser.newPage();
		assert(!!page, 'browser.newPage() returned a Page');

		// Navigate
		await page.goto('https://example.com');
		assert(true, 'page.goto("https://example.com") succeeded');

		// Check URL
		const url = await page.url();
		assert(url.includes('example.com'), `page.url() = "${url}"`);

		// Check title
		const title = await page.title();
		assertEq(title, 'Example Domain', `page.title() = "${title}"`);

		// Get page content
		const content = await page.content();
		assert(content.includes('Example Domain'), 'page.content() includes "Example Domain"');
		assert(content.includes('<h1>'), 'page.content() includes <h1> tag');

		// Evaluate JavaScript
		const evalResult = await page.evaluate('document.querySelectorAll("p").length');
		assert(evalResult > 0, `page.evaluate() returned ${evalResult} paragraph(s)`);

		// Take a screenshot
		const screenshot = await page.screenshot();
		assert(screenshot instanceof Buffer, 'page.screenshot() returned a Buffer');
		assert(screenshot.length > 1000, `Screenshot is ${screenshot.length} bytes`);

		// Test ElementHandle via page.get()
		const h1 = page.get({ selector: 'h1' });
		const h1Text = await h1.textContent();
		assertEq(h1Text, 'Example Domain', `ElementHandle.textContent() = "${h1Text}"`);

		// Test isVisible
		const isVisible = await h1.isVisible();
		assert(isVisible, 'h1 is visible');

		// Test getByText
		const link = page.getByText('Learn more');
		const linkText = await link.textContent();
		assert(linkText.includes('Learn more'), `getByText found: "${linkText}"`);

		// Close the page
		await page.close();
		assert(true, 'page.close() succeeded');
	} catch (err) {
		console.log(`  ${FAIL} Browser API test threw: ${err.message}`);
		if (err.stack) console.log(`    ${err.stack.split('\n').slice(1, 3).join('\n    ')}`);
		failed++;
	} finally {
		if (browser) {
			await browser.close().catch(() => {});
			assert(true, 'Browser closed');
		}
	}
}

// ============================================================================
// Test 3: Multiple pages + navigation
// ============================================================================

async function testMultiplePages() {
	console.log(`\n${BOLD}Test 3: Multiple pages + navigation${RESET}`);

	let browser;
	try {
		browser = await Browser.launch({
			browser: 'chrome',
			headless: true,
		});

		// Create two pages
		const page1 = await browser.newPage();
		const page2 = await browser.newPage();
		assert(
			browser.openPages.length === 2,
			`browser.openPages.length = ${browser.openPages.length}`,
		);

		// Navigate to different pages
		await page1.goto('https://example.com');
		await page2.goto('https://www.iana.org/help/example-domains');

		const url1 = await page1.url();
		const url2 = await page2.url();
		assert(url1.includes('example.com'), `Page 1 URL: ${url1}`);
		assert(url2.includes('iana.org'), `Page 2 URL: ${url2}`);

		// Close one page
		await page1.close();
		assert(true, 'Closed page 1');

		// Page 2 should still work
		const title2 = await page2.title();
		assert(title2.length > 0, `Page 2 title: "${title2}"`);

		await page2.close();
		assert(true, 'Closed page 2');
	} catch (err) {
		console.log(`  ${FAIL} Multiple pages test threw: ${err.message}`);
		if (err.stack) console.log(`    ${err.stack.split('\n').slice(1, 3).join('\n    ')}`);
		failed++;
	} finally {
		if (browser) {
			await browser.close().catch(() => {});
			assert(true, 'Browser closed');
		}
	}
}

// ============================================================================
// Test 4: Page.evaluate() with complex values
// ============================================================================

async function testEvaluate() {
	console.log(`\n${BOLD}Test 4: page.evaluate() with complex values${RESET}`);

	let browser;
	try {
		browser = await Browser.launch({ headless: true });
		const page = await browser.newPage();
		await page.goto('https://example.com');

		// String
		const str = await page.evaluate('document.title');
		assertEq(str, 'Example Domain', 'evaluate returns string');

		// Number
		const num = await page.evaluate('1 + 2 + 3');
		assertEq(num, 6, 'evaluate returns number');

		// Boolean
		const bool = await page.evaluate('true');
		assertEq(bool, true, 'evaluate returns boolean');

		// Null
		const nul = await page.evaluate('null');
		assertEq(nul, null, 'evaluate returns null');

		// Array
		const arr = await page.evaluate('[1, 2, 3]');
		assert(Array.isArray(arr), 'evaluate returns array');
		assertEq(arr?.length, 3, 'array has 3 elements');

		// Object
		const obj = await page.evaluate('({foo: "bar", num: 42})');
		assertEq(obj?.foo, 'bar', 'evaluate returns object with string field');
		assertEq(obj?.num, 42, 'evaluate returns object with number field');

		await page.close();
	} catch (err) {
		console.log(`  ${FAIL} Evaluate test threw: ${err.message}`);
		if (err.stack) console.log(`    ${err.stack.split('\n').slice(1, 3).join('\n    ')}`);
		failed++;
	} finally {
		if (browser) {
			await browser.close().catch(() => {});
		}
	}
}

// ============================================================================
// Test 5: page.go() and page.see() English aliases
// ============================================================================

async function testEnglishAliases() {
	console.log(`\n${BOLD}Test 5: English API aliases (page.go, page.see)${RESET}`);

	let browser;
	try {
		browser = await Browser.launch({ headless: true });
		const page = await browser.newPage();

		// page.go() should work like page.goto()
		await page.go('https://example.com');
		const url = await page.url();
		assert(url.includes('example.com'), 'page.go() navigated correctly');

		// page.see() should find and verify a visible element
		const handle = await page.see('Example Domain');
		assert(!!handle, 'page.see() returned an ElementHandle');
		assert(typeof handle.click === 'function', 'page.see() result has click method');
		assert(typeof handle.textContent === 'function', 'page.see() result has textContent method');

		// page.see() should find partial text
		const moreLink = await page.see('Learn more');
		assert(!!moreLink, 'page.see() found "Learn more" link');

		// page.see() should throw for non-existent text
		let seeThrew = false;
		try {
			await page.see('This text does not exist on the page XYZ123', { timeout: 2000 });
		} catch {
			seeThrew = true;
		}
		assert(seeThrew, 'page.see() throws when element is not found');

		await page.close();
	} catch (err) {
		console.log(`  ${FAIL} English aliases test threw: ${err.message}`);
		if (err.stack) console.log(`    ${err.stack.split('\n').slice(1, 3).join('\n    ')}`);
		failed++;
	} finally {
		if (browser) {
			await browser.close().catch(() => {});
		}
	}
}

// ============================================================================
// Test 6: Rich error classes
// ============================================================================

async function testErrorClasses() {
	console.log(`\n${BOLD}Test 6: Rich error classes${RESET}`);

	try {
		// BrowsecraftError
		const baseErr = new BrowsecraftError({
			action: 'click',
			target: 'Submit',
			message: 'element not found',
			hint: 'Check the selector',
			elapsed: 5000,
		});
		assert(baseErr instanceof Error, 'BrowsecraftError extends Error');
		assert(
			baseErr.name === 'BrowsecraftError',
			`name is "BrowsecraftError" (got "${baseErr.name}")`,
		);
		assert(baseErr.action === 'click', 'action property set');
		assert(baseErr.target === 'Submit', 'target property set');
		assert(baseErr.hint === 'Check the selector', 'hint property set');
		assert(baseErr.elapsed === 5000, 'elapsed property set');
		assert(
			baseErr.message.includes("Could not click 'Submit'"),
			'message includes readable prefix',
		);
		assert(baseErr.message.includes('Hint:'), 'message includes hint');

		// ElementNotFoundError
		const notFoundErr = new ElementNotFoundError({
			action: 'fill',
			target: 'Email',
			elapsed: 3000,
			suggestions: ['Email Address', 'Email Input'],
		});
		assert(
			notFoundErr instanceof BrowsecraftError,
			'ElementNotFoundError extends BrowsecraftError',
		);
		assert(notFoundErr.name === 'ElementNotFoundError', `name is "ElementNotFoundError"`);
		assert(notFoundErr.message.includes('Email Address'), 'includes suggestions in message');
		assert(notFoundErr.message.includes('Email Input'), 'includes all suggestions');
		assert(notFoundErr.elementState?.found === false, 'elementState.found is false');

		// ElementNotActionableError
		const notActionableErr = new ElementNotActionableError({
			action: 'click',
			target: 'Submit',
			reason: 'disabled',
			elementState: { found: true, visible: true, enabled: false, tagName: 'BUTTON' },
			elapsed: 2000,
		});
		assert(
			notActionableErr instanceof BrowsecraftError,
			'ElementNotActionableError extends BrowsecraftError',
		);
		assert(notActionableErr.name === 'ElementNotActionableError', 'name is correct');
		assert(notActionableErr.reason === 'disabled', 'reason property set');
		assert(notActionableErr.message.includes('disabled'), 'message explains the reason');
		assert(notActionableErr.elementState?.tagName === 'BUTTON', 'element state has tagName');

		// NetworkError
		const netErr = new NetworkError({
			action: 'intercept',
			target: '/api/users',
			message: 'request timed out',
		});
		assert(netErr instanceof BrowsecraftError, 'NetworkError extends BrowsecraftError');
		assert(netErr.name === 'NetworkError', 'name is correct');

		// TimeoutError
		const timeoutErr = new TimeoutError({
			action: 'waitForSelector',
			target: '.loading',
			message: 'timed out waiting for element',
			elapsed: 30000,
		});
		assert(timeoutErr instanceof BrowsecraftError, 'TimeoutError extends BrowsecraftError');
		assert(timeoutErr.name === 'TimeoutError', 'name is correct');
		assert(timeoutErr.elapsed === 30000, 'elapsed set on TimeoutError');

		// Error with all notActionable reasons
		for (const reason of ['not-visible', 'disabled', 'obscured', 'zero-size', 'detached']) {
			const err = new ElementNotActionableError({
				action: 'click',
				target: 'btn',
				reason,
				elementState: { found: true },
			});
			assert(err.reason === reason, `ElementNotActionableError reason="${reason}" works`);
		}
	} catch (err) {
		console.log(`  ${FAIL} Error classes test threw: ${err.message}`);
		if (err.stack) console.log(`    ${err.stack.split('\n').slice(1, 3).join('\n    ')}`);
		failed++;
	}
}

// ============================================================================
// Test 7: data-testid auto-detection in locator
// ============================================================================

async function testDataTestId() {
	console.log(`\n${BOLD}Test 7: data-testid auto-detection${RESET}`);

	let browser;
	try {
		browser = await Browser.launch({ headless: true });
		const page = await browser.newPage();

		// Navigate to a page and inject elements with data-testid
		await page.goto('https://example.com');
		await page.evaluate(`
			const div = document.createElement('div');
			div.setAttribute('data-testid', 'my-widget');
			div.textContent = 'Widget Content';
			document.body.appendChild(div);

			const btn = document.createElement('button');
			btn.setAttribute('data-test', 'submit-btn');
			btn.textContent = 'Submit via data-test';
			document.body.appendChild(btn);

			const input = document.createElement('input');
			input.setAttribute('data-test-id', 'email-input');
			input.setAttribute('placeholder', 'Enter email');
			document.body.appendChild(input);
		`);

		// page.getByTestId should find data-testid elements
		const widget = page.getByTestId('my-widget');
		const widgetText = await widget.textContent();
		assertEq(widgetText, 'Widget Content', 'getByTestId("my-widget") found element');

		// Verify getByTestId is visible
		const widgetVisible = await widget.isVisible();
		assert(widgetVisible, 'data-testid element is visible');

		await page.close();
	} catch (err) {
		console.log(`  ${FAIL} data-testid test threw: ${err.message}`);
		if (err.stack) console.log(`    ${err.stack.split('\n').slice(1, 3).join('\n    ')}`);
		failed++;
	} finally {
		if (browser) {
			await browser.close().catch(() => {});
		}
	}
}

// ============================================================================
// Test 8: Built-in BDD step registration
// ============================================================================

async function testBuiltInSteps() {
	console.log(`\n${BOLD}Test 8: Built-in BDD step definitions${RESET}`);

	try {
		// getBuiltInStepPatterns should return the list
		const patterns = getBuiltInStepPatterns();
		assert(Array.isArray(patterns), 'getBuiltInStepPatterns() returns an array');
		assert(patterns.length >= 25, `At least 25 built-in steps (got ${patterns.length})`);

		// Check key step types exist
		const givenSteps = patterns.filter((s) => s.type === 'Given');
		const whenSteps = patterns.filter((s) => s.type === 'When');
		const thenSteps = patterns.filter((s) => s.type === 'Then');
		assert(givenSteps.length >= 3, `At least 3 Given steps (got ${givenSteps.length})`);
		assert(whenSteps.length >= 10, `At least 10 When steps (got ${whenSteps.length})`);
		assert(thenSteps.length >= 5, `At least 5 Then steps (got ${thenSteps.length})`);

		// Check specific patterns exist
		const patternTexts = patterns.map((p) => p.pattern);
		assert(patternTexts.includes('I am on {string}'), 'Has "I am on {string}" step');
		assert(patternTexts.includes('I click {string}'), 'Has "I click {string}" step');
		assert(
			patternTexts.includes('I fill {string} with {string}'),
			'Has "I fill {string} with {string}" step',
		);
		assert(patternTexts.includes('I should see {string}'), 'Has "I should see {string}" step');
		assert(patternTexts.includes('I press {string}'), 'Has "I press {string}" step');
		assert(patternTexts.includes('I select {string} from {string}'), 'Has select step');
		assert(patternTexts.includes('I check {string}'), 'Has check step');
		assert(patternTexts.includes('I hover over {string}'), 'Has hover step');
		assert(patternTexts.includes('I drag {string} to {string}'), 'Has drag step');
		assert(patternTexts.includes('the URL should contain {string}'), 'Has URL assertion step');
		assert(patternTexts.includes('the title should be {string}'), 'Has title assertion step');

		// registerBuiltInSteps on a fresh registry
		const registry = new StepRegistry();
		registerBuiltInSteps(registry);
		const allSteps = registry.getAll();
		assertEq(
			allSteps.length,
			patterns.length,
			`Registry has ${patterns.length} steps after registration`,
		);

		// Verify matching works
		const match = registry.match('I click "Submit"', 'When');
		assert(match !== null, 'Registry matches "I click \\"Submit\\""');
		assertEq(match?.args?.[0], 'Submit', 'Extracted arg is "Submit"');

		const fillMatch = registry.match('I fill "Email" with "test@example.com"', 'When');
		assert(fillMatch !== null, 'Registry matches fill step');
		assertEq(fillMatch?.args?.[0], 'Email', 'Fill target is "Email"');
		assertEq(fillMatch?.args?.[1], 'test@example.com', 'Fill value is "test@example.com"');

		const navMatch = registry.match('I am on "https://example.com"', 'Given');
		assert(navMatch !== null, 'Registry matches navigation step');
		assertEq(navMatch?.args?.[0], 'https://example.com', 'Nav URL extracted correctly');

		// registerBuiltInSteps is idempotent on global registry
		const beforeCount = globalRegistry.getAll().length;
		registerBuiltInSteps();
		registerBuiltInSteps(); // second call should be no-op
		const afterCount = globalRegistry.getAll().length;
		assertEq(
			afterCount,
			beforeCount + patterns.length,
			'registerBuiltInSteps is idempotent on second call',
		);
	} catch (err) {
		console.log(`  ${FAIL} Built-in steps test threw: ${err.message}`);
		if (err.stack) console.log(`    ${err.stack.split('\n').slice(1, 3).join('\n    ')}`);
		failed++;
	}
}

// ============================================================================
// Test 9: BDD integration — run a .feature file against saucedemo.com
// ============================================================================

async function testBddIntegration() {
	console.log(`\n${BOLD}Test 9: BDD integration (saucedemo.com login)${RESET}`);

	let browser;
	try {
		registerBuiltInSteps();

		const featurePath = 'tests/features/sauce-login.feature';
		const src = fs.readFileSync(featurePath, 'utf8');
		const doc = parseGherkin(src, featurePath);

		assert(doc.feature?.name === 'Sauce Demo Login', 'feature file parsed correctly');

    browser = await Browser.launch({ headless: true });

		const executor = new BddExecutor({
			stepTimeout: 30000,
			worldFactory: async () => {
				const page = await browser.newPage();
				return {
					page,
					browser,
					ctx: {},
					attach: () => {},
					log: () => {},
				};
			},
			onStepEnd: (r) => {
				const icon =
					r.status === 'passed' ? PASS : r.status === 'failed' ? FAIL : '\x1b[33m?\x1b[0m';
				console.log(`    ${icon} ${r.keyword.trim()} ${r.text} (${r.duration}ms)`);
				if (r.status === 'failed' && r.error) {
					console.log(`      ${r.error.message}`);
				}
			},
		});

		const results = await executor.run([doc]);
		const summary = results.summary;

		assert(summary.features.total === 1, 'ran 1 feature');
		assert(summary.features.passed === 1, 'feature passed');
		assert(summary.scenarios.passed === 1, 'scenario passed');
		assert(summary.steps.total === 6, 'all 6 steps executed');
		assert(summary.steps.passed === 6, 'all 6 steps passed');
		assert(summary.steps.failed === 0, '0 steps failed');
	} catch (err) {
		console.log(`  ${FAIL} BDD integration test threw: ${err.message}`);
		if (err.stack) console.log(`    ${err.stack.split('\n').slice(1, 3).join('\n    ')}`);
		failed++;
	} finally {
		if (browser) await browser.close().catch(() => {});
	}
}

// ============================================================================
// Run all tests
// ============================================================================

async function main() {
	console.log(`${BOLD}============================================${RESET}`);
	console.log(`${BOLD}  Browsecraft Smoke Test${RESET}`);
	console.log(`${BOLD}============================================${RESET}`);

	const startTime = Date.now();

	await testBiDiSession();
	await testBrowserAPI();
	await testMultiplePages();
	await testEvaluate();
	await testEnglishAliases();
	await testErrorClasses();
	await testDataTestId();
	await testBuiltInSteps();
	await testBddIntegration();

	const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

	console.log(`\n${BOLD}============================================${RESET}`);
	console.log(
		`  ${PASS} ${passed} passed    ${failed > 0 ? FAIL : ''} ${failed} failed    (${elapsed}s)`,
	);
	console.log(`${BOLD}============================================${RESET}\n`);

	if (failed > 0) {
		process.exit(1);
	}
}

main().catch((err) => {
	console.error('Smoke test crashed:', err);
	process.exit(1);
});
