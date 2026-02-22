#!/usr/bin/env node

// ============================================================================
// Browsecraft Smoke Test
// Verifies the full stack works end-to-end: launcher -> transport -> session.
// Run: node tests/smoke.mjs
// ============================================================================

// We import from the compiled dist output to test what users will actually get
import { BiDiSession } from '../packages/browsecraft-bidi/dist/index.js';
import { Browser } from '../packages/browsecraft/dist/index.js';

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
