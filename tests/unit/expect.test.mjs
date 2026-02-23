#!/usr/bin/env node

// ============================================================================
// Unit Tests — Assertion System (expect.ts)
// Tests the expect() routing, AssertionError, retry engine, and .not negation
// using mock Page/ElementHandle objects.
// ============================================================================

import assert from 'node:assert/strict';
import { AssertionError, expect } from '../../packages/browsecraft/dist/index.js';

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
let passed = 0;
let failed = 0;

async function testAsync(name, fn) {
	try {
		await fn();
		console.log(`  ${PASS} ${name}`);
		passed++;
	} catch (err) {
		console.log(`  ${FAIL} ${name}`);
		console.log(`    ${err.message}`);
		failed++;
	}
}

console.log('\n\x1b[1mExpect / Assertion Tests\x1b[0m\n');

// -----------------------------------------------------------------------
// AssertionError
// -----------------------------------------------------------------------

await testAsync('AssertionError is an Error', () => {
	const err = new AssertionError('test message');
	assert.ok(err instanceof Error);
	assert.equal(err.message, 'test message');
});

await testAsync('AssertionError has correct name', () => {
	const err = new AssertionError('test');
	assert.equal(err.name, 'AssertionError');
});

await testAsync('AssertionError has a stack trace', () => {
	const err = new AssertionError('test');
	assert.ok(err.stack && err.stack.length > 0);
});

await testAsync('AssertionError can be caught', async () => {
	let caught = false;
	try {
		throw new AssertionError('deliberate');
	} catch (err) {
		if (err instanceof AssertionError) caught = true;
	}
	assert.ok(caught);
});

// -----------------------------------------------------------------------
// expect() routing — Page vs ElementHandle
// -----------------------------------------------------------------------

// Mock a Page-like object (has contextId + session, but no target)
function mockPage(overrides = {}) {
	return {
		contextId: 'ctx-123',
		session: { script: {} },
		url: async () => 'https://example.com/dashboard',
		title: async () => 'My Dashboard',
		evaluate: async (expr) => {
			if (expr === 'document.body?.innerText || ""') return 'Welcome to the dashboard';
			return '';
		},
		content: async () => '<html>test</html>',
		...overrides,
	};
}

// Mock an ElementHandle-like object (has target property)
function mockElement(overrides = {}) {
	return {
		target: { selector: '#btn' },
		page: { contextId: 'ctx-123', session: { script: {} } },
		textContent: async () => 'Submit',
		isVisible: async () => true,
		getAttribute: async (name) => {
			if (name === 'id') return 'submit-btn';
			if (name === 'class') return 'btn primary';
			if (name === 'placeholder') return 'Enter text';
			return null;
		},
		count: async () => 3,
		locate: async () => ({ node: { sharedId: 'ref-1' } }),
		...overrides,
	};
}

await testAsync('expect(page) returns PageAssertions', () => {
	const page = mockPage();
	const assertions = expect(page);
	assert.ok(assertions);
	// PageAssertions should have toHaveURL
	assert.ok(typeof assertions.toHaveURL === 'function');
	assert.ok(typeof assertions.toHaveTitle === 'function');
	assert.ok(typeof assertions.toHaveContent === 'function');
});

await testAsync('expect(element) returns ElementAssertions', () => {
	const el = mockElement();
	const assertions = expect(el);
	assert.ok(assertions);
	// ElementAssertions should have toBeVisible
	assert.ok(typeof assertions.toBeVisible === 'function');
	assert.ok(typeof assertions.toHaveText === 'function');
	assert.ok(typeof assertions.toContainText === 'function');
	assert.ok(typeof assertions.toHaveCount === 'function');
	assert.ok(typeof assertions.toHaveAttribute === 'function');
});

// -----------------------------------------------------------------------
// PageAssertions — toHaveURL
// -----------------------------------------------------------------------

await testAsync('toHaveURL passes when URL contains string', async () => {
	const page = mockPage({ url: async () => 'https://example.com/dashboard' });
	await expect(page).toHaveURL('dashboard', { timeout: 500 });
});

await testAsync('toHaveURL passes with regex', async () => {
	const page = mockPage({ url: async () => 'https://example.com/dashboard/123' });
	await expect(page).toHaveURL(/dashboard\/\d+/, { timeout: 500 });
});

await testAsync('toHaveURL fails when URL does not match', async () => {
	const page = mockPage({ url: async () => 'https://example.com/login' });
	await assert.rejects(
		() => expect(page).toHaveURL('dashboard', { timeout: 300 }),
		(err) => err instanceof AssertionError,
	);
});

await testAsync('toHaveURL.not passes when URL does not match', async () => {
	const page = mockPage({ url: async () => 'https://example.com/login' });
	await expect(page).not.toHaveURL('dashboard', { timeout: 500 });
});

await testAsync('toHaveURL.not fails when URL matches', async () => {
	const page = mockPage({ url: async () => 'https://example.com/dashboard' });
	await assert.rejects(
		() => expect(page).not.toHaveURL('dashboard', { timeout: 300 }),
		(err) => err instanceof AssertionError,
	);
});

// -----------------------------------------------------------------------
// PageAssertions — toHaveTitle
// -----------------------------------------------------------------------

await testAsync('toHaveTitle passes when title matches', async () => {
	const page = mockPage({ title: async () => 'My Dashboard' });
	await expect(page).toHaveTitle('Dashboard', { timeout: 500 });
});

await testAsync('toHaveTitle passes with regex', async () => {
	const page = mockPage({ title: async () => 'My Dashboard v2' });
	await expect(page).toHaveTitle(/Dashboard v\d/, { timeout: 500 });
});

await testAsync('toHaveTitle fails when title does not match', async () => {
	const page = mockPage({ title: async () => 'Login Page' });
	await assert.rejects(
		() => expect(page).toHaveTitle('Dashboard', { timeout: 300 }),
		(err) => err instanceof AssertionError,
	);
});

await testAsync('toHaveTitle.not works', async () => {
	const page = mockPage({ title: async () => 'Login Page' });
	await expect(page).not.toHaveTitle('Dashboard', { timeout: 500 });
});

// -----------------------------------------------------------------------
// PageAssertions — toHaveContent
// -----------------------------------------------------------------------

await testAsync('toHaveContent passes when content matches', async () => {
	const page = mockPage({
		evaluate: async () => 'Welcome to the dashboard. You have 5 notifications.',
	});
	await expect(page).toHaveContent('Welcome', { timeout: 500 });
});

await testAsync('toHaveContent passes with regex', async () => {
	const page = mockPage({
		evaluate: async () => 'You have 42 items in your cart',
	});
	await expect(page).toHaveContent(/\d+ items/, { timeout: 500 });
});

await testAsync('toHaveContent.not works', async () => {
	const page = mockPage({
		evaluate: async () => 'Hello world',
	});
	await expect(page).not.toHaveContent('Goodbye', { timeout: 500 });
});

// -----------------------------------------------------------------------
// ElementAssertions — toBeVisible
// -----------------------------------------------------------------------

await testAsync('toBeVisible passes when element is visible', async () => {
	const el = mockElement({ isVisible: async () => true });
	await expect(el).toBeVisible({ timeout: 500 });
});

await testAsync('toBeVisible fails when element is hidden', async () => {
	const el = mockElement({ isVisible: async () => false });
	await assert.rejects(
		() => expect(el).toBeVisible({ timeout: 300 }),
		(err) => err instanceof AssertionError,
	);
});

await testAsync('not.toBeVisible passes when hidden', async () => {
	const el = mockElement({ isVisible: async () => false });
	await expect(el).not.toBeVisible({ timeout: 500 });
});

// -----------------------------------------------------------------------
// ElementAssertions — toBeHidden
// -----------------------------------------------------------------------

await testAsync('toBeHidden passes when element is hidden', async () => {
	const el = mockElement({ isVisible: async () => false });
	await expect(el).toBeHidden({ timeout: 500 });
});

await testAsync('toBeHidden fails when element is visible', async () => {
	const el = mockElement({ isVisible: async () => true });
	await assert.rejects(
		() => expect(el).toBeHidden({ timeout: 300 }),
		(err) => err instanceof AssertionError,
	);
});

// -----------------------------------------------------------------------
// ElementAssertions — toHaveText
// -----------------------------------------------------------------------

await testAsync('toHaveText passes with exact match', async () => {
	const el = mockElement({ textContent: async () => 'Submit Order' });
	await expect(el).toHaveText('Submit Order', { timeout: 500 });
});

await testAsync('toHaveText trims whitespace', async () => {
	const el = mockElement({ textContent: async () => '  Submit Order  ' });
	await expect(el).toHaveText('Submit Order', { timeout: 500 });
});

await testAsync('toHaveText passes with regex', async () => {
	const el = mockElement({ textContent: async () => 'Item count: 42' });
	await expect(el).toHaveText(/count: \d+/, { timeout: 500 });
});

await testAsync('toHaveText fails on mismatch', async () => {
	const el = mockElement({ textContent: async () => 'Cancel' });
	await assert.rejects(
		() => expect(el).toHaveText('Submit', { timeout: 300 }),
		(err) => err instanceof AssertionError && err.message.includes('Cancel'),
	);
});

await testAsync('not.toHaveText passes when text differs', async () => {
	const el = mockElement({ textContent: async () => 'Cancel' });
	await expect(el).not.toHaveText('Submit', { timeout: 500 });
});

// -----------------------------------------------------------------------
// ElementAssertions — toContainText
// -----------------------------------------------------------------------

await testAsync('toContainText passes when text is contained', async () => {
	const el = mockElement({ textContent: async () => 'Submit Order Now' });
	await expect(el).toContainText('Order', { timeout: 500 });
});

await testAsync('toContainText fails when text is not contained', async () => {
	const el = mockElement({ textContent: async () => 'Submit' });
	await assert.rejects(
		() => expect(el).toContainText('Order', { timeout: 300 }),
		(err) => err instanceof AssertionError,
	);
});

await testAsync('toContainText with regex', async () => {
	const el = mockElement({ textContent: async () => 'Total: $42.99' });
	await expect(el).toContainText(/\$\d+\.\d{2}/, { timeout: 500 });
});

// -----------------------------------------------------------------------
// ElementAssertions — toHaveCount
// -----------------------------------------------------------------------

await testAsync('toHaveCount passes with correct count', async () => {
	const el = mockElement({ count: async () => 5 });
	await expect(el).toHaveCount(5, { timeout: 500 });
});

await testAsync('toHaveCount fails with wrong count', async () => {
	const el = mockElement({ count: async () => 3 });
	await assert.rejects(
		() => expect(el).toHaveCount(5, { timeout: 300 }),
		(err) => err instanceof AssertionError && err.message.includes('5'),
	);
});

await testAsync('not.toHaveCount passes when count differs', async () => {
	const el = mockElement({ count: async () => 3 });
	await expect(el).not.toHaveCount(5, { timeout: 500 });
});

// -----------------------------------------------------------------------
// ElementAssertions — toHaveAttribute
// -----------------------------------------------------------------------

await testAsync('toHaveAttribute passes when attribute matches', async () => {
	const el = mockElement({
		getAttribute: async (name) => (name === 'type' ? 'email' : null),
	});
	await expect(el).toHaveAttribute('type', 'email', { timeout: 500 });
});

await testAsync('toHaveAttribute with regex', async () => {
	const el = mockElement({
		getAttribute: async (name) => (name === 'href' ? '/login?redirect=home' : null),
	});
	await expect(el).toHaveAttribute('href', /login/, { timeout: 500 });
});

await testAsync('toHaveAttribute checks existence when no expected value', async () => {
	const el = mockElement({
		getAttribute: async (name) => (name === 'disabled' ? '' : null),
	});
	await expect(el).toHaveAttribute('disabled', undefined, { timeout: 500 });
});

await testAsync('toHaveAttribute fails when attribute missing', async () => {
	const el = mockElement({
		getAttribute: async () => null,
	});
	await assert.rejects(
		() => expect(el).toHaveAttribute('data-id', 'test', { timeout: 300 }),
		(err) => err instanceof AssertionError,
	);
});

await testAsync('not.toHaveAttribute passes when no match', async () => {
	const el = mockElement({
		getAttribute: async (name) => (name === 'type' ? 'text' : null),
	});
	await expect(el).not.toHaveAttribute('type', 'email', { timeout: 500 });
});

// -----------------------------------------------------------------------
// ElementAssertions — toHaveClass
// -----------------------------------------------------------------------

await testAsync('toHaveClass passes when class is present', async () => {
	const el = mockElement({
		getAttribute: async (name) => (name === 'class' ? 'btn primary active' : null),
	});
	await expect(el).toHaveClass('primary', { timeout: 500 });
});

await testAsync('toHaveClass fails when class is missing', async () => {
	const el = mockElement({
		getAttribute: async (name) => (name === 'class' ? 'btn secondary' : null),
	});
	await assert.rejects(
		() => expect(el).toHaveClass('primary', { timeout: 300 }),
		(err) => err instanceof AssertionError,
	);
});

await testAsync('toHaveClass with regex', async () => {
	const el = mockElement({
		getAttribute: async (name) => (name === 'class' ? 'alert alert-success' : null),
	});
	await expect(el).toHaveClass(/alert-\w+/, { timeout: 500 });
});

// -----------------------------------------------------------------------
// ElementAssertions — toHaveId
// -----------------------------------------------------------------------

await testAsync('toHaveId passes when id matches', async () => {
	const el = mockElement({
		getAttribute: async (name) => (name === 'id' ? 'submit-btn' : null),
	});
	await expect(el).toHaveId('submit-btn', { timeout: 500 });
});

await testAsync('toHaveId fails on mismatch', async () => {
	const el = mockElement({
		getAttribute: async (name) => (name === 'id' ? 'cancel-btn' : null),
	});
	await assert.rejects(
		() => expect(el).toHaveId('submit-btn', { timeout: 300 }),
		(err) => err instanceof AssertionError,
	);
});

// -----------------------------------------------------------------------
// ElementAssertions — toHavePlaceholder
// -----------------------------------------------------------------------

await testAsync('toHavePlaceholder passes when placeholder matches', async () => {
	const el = mockElement({
		getAttribute: async (name) => (name === 'placeholder' ? 'Enter email' : null),
	});
	await expect(el).toHavePlaceholder('Enter email', { timeout: 500 });
});

await testAsync('toHavePlaceholder with regex', async () => {
	const el = mockElement({
		getAttribute: async (name) => (name === 'placeholder' ? 'Enter your email address' : null),
	});
	await expect(el).toHavePlaceholder(/email/, { timeout: 500 });
});

await testAsync('toHavePlaceholder fails when no placeholder', async () => {
	const el = mockElement({
		getAttribute: async () => null,
	});
	await assert.rejects(
		() => expect(el).toHavePlaceholder('Enter email', { timeout: 300 }),
		(err) => err instanceof AssertionError,
	);
});

// -----------------------------------------------------------------------
// Retry engine behavior
// -----------------------------------------------------------------------

await testAsync('retry engine retries until condition passes', async () => {
	let callCount = 0;
	const page = mockPage({
		url: async () => {
			callCount++;
			// Starts as /login, then changes to /dashboard after 3rd call
			return callCount >= 3 ? 'https://example.com/dashboard' : 'https://example.com/login';
		},
	});

	await expect(page).toHaveURL('dashboard', { timeout: 2000 });
	assert.ok(callCount >= 3, `Expected at least 3 calls, got ${callCount}`);
});

await testAsync('retry engine respects timeout', async () => {
	const start = Date.now();
	const page = mockPage({ url: async () => 'https://example.com/login' });

	try {
		await expect(page).toHaveURL('dashboard', { timeout: 300 });
		assert.fail('Should have thrown');
	} catch (err) {
		const elapsed = Date.now() - start;
		assert.ok(err instanceof AssertionError);
		// Should have waited ~300ms (with some tolerance)
		assert.ok(elapsed >= 250, `Elapsed ${elapsed}ms, expected >= 250`);
		assert.ok(elapsed < 1000, `Elapsed ${elapsed}ms, expected < 1000`);
	}
});

// -----------------------------------------------------------------------
// .not chaining returns new instance
// -----------------------------------------------------------------------

await testAsync('.not returns a new assertion instance', () => {
	const page = mockPage();
	const a = expect(page);
	const b = a.not;
	assert.notStrictEqual(a, b);
});

await testAsync('.not on element returns a new assertion instance', () => {
	const el = mockElement();
	const a = expect(el);
	const b = a.not;
	assert.notStrictEqual(a, b);
});

// -----------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------

console.log(`\n  Expect: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
