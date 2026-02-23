#!/usr/bin/env node

// ============================================================================
// Unit Tests — Rich Error System
// ============================================================================

import assert from 'node:assert/strict';
import {
	BrowsecraftError,
	ElementNotActionableError,
	ElementNotFoundError,
	NetworkError,
	TimeoutError,
	classifyFailure,
} from '../../packages/browsecraft/dist/index.js';

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
let passed = 0;
let failed = 0;

function test(name, fn) {
	try {
		fn();
		console.log(`  ${PASS} ${name}`);
		passed++;
	} catch (err) {
		console.log(`  ${FAIL} ${name}`);
		console.log(`    ${err.message}`);
		failed++;
	}
}

console.log('\n\x1b[1mError System Tests\x1b[0m\n');

// -----------------------------------------------------------------------
// BrowsecraftError — base class
// -----------------------------------------------------------------------

test('BrowsecraftError has correct name', () => {
	const err = new BrowsecraftError({
		action: 'click',
		target: 'Submit',
		message: 'something went wrong',
	});
	assert.equal(err.name, 'BrowsecraftError');
});

test('BrowsecraftError message format', () => {
	const err = new BrowsecraftError({
		action: 'click',
		target: 'Submit',
		message: 'something went wrong',
	});
	assert.ok(err.message.includes("Could not click 'Submit'"));
	assert.ok(err.message.includes('something went wrong'));
});

test('BrowsecraftError stores action and target', () => {
	const err = new BrowsecraftError({
		action: 'type',
		target: 'Email',
		message: 'failed',
	});
	assert.equal(err.action, 'type');
	assert.equal(err.target, 'Email');
});

test('BrowsecraftError includes hint when provided', () => {
	const err = new BrowsecraftError({
		action: 'click',
		target: 'Button',
		message: 'not ready',
		hint: 'Wait for the page to load',
	});
	assert.ok(err.message.includes('Hint: Wait for the page to load'));
	assert.equal(err.hint, 'Wait for the page to load');
});

test('BrowsecraftError includes elapsed time', () => {
	const err = new BrowsecraftError({
		action: 'click',
		target: 'Button',
		message: 'timed out',
		elapsed: 5000,
	});
	assert.ok(err.message.includes('waited 5000ms'));
	assert.equal(err.elapsed, 5000);
});

test('BrowsecraftError includes element state', () => {
	const err = new BrowsecraftError({
		action: 'click',
		target: 'Button',
		message: 'not visible',
		elementState: {
			found: true,
			tagName: 'BUTTON',
			visible: false,
			enabled: true,
			id: 'submit-btn',
			classes: 'btn primary',
			textPreview: 'Submit',
		},
	});
	assert.ok(err.message.includes('<button>'));
	assert.ok(err.message.includes('#submit-btn'));
	assert.ok(err.message.includes('btn primary'));
	assert.ok(err.message.includes('Visible: false'));
});

test('BrowsecraftError extends Error', () => {
	const err = new BrowsecraftError({
		action: 'click',
		target: 'X',
		message: 'test',
	});
	assert.ok(err instanceof Error);
	assert.ok(err instanceof BrowsecraftError);
});

test('BrowsecraftError preserves cause', () => {
	const cause = new Error('original');
	const err = new BrowsecraftError({
		action: 'click',
		target: 'X',
		message: 'wrapper',
		cause,
	});
	assert.equal(err.cause, cause);
});

// -----------------------------------------------------------------------
// ElementNotFoundError
// -----------------------------------------------------------------------

test('ElementNotFoundError has correct name', () => {
	const err = new ElementNotFoundError({
		action: 'click',
		target: 'Submit',
	});
	assert.equal(err.name, 'ElementNotFoundError');
});

test('ElementNotFoundError extends BrowsecraftError', () => {
	const err = new ElementNotFoundError({
		action: 'click',
		target: 'Submit',
	});
	assert.ok(err instanceof BrowsecraftError);
	assert.ok(err instanceof Error);
});

test('ElementNotFoundError message mentions not found', () => {
	const err = new ElementNotFoundError({
		action: 'click',
		target: 'Submit',
	});
	assert.ok(err.message.includes('no matching element found'));
});

test('ElementNotFoundError includes suggestions', () => {
	const err = new ElementNotFoundError({
		action: 'click',
		target: 'Sbumit',
		suggestions: ['Submit', 'Subscribe'],
	});
	assert.ok(err.message.includes('Did you mean'));
	assert.ok(err.message.includes('Submit'));
	assert.ok(err.message.includes('Subscribe'));
});

test('ElementNotFoundError without suggestions gives generic hint', () => {
	const err = new ElementNotFoundError({
		action: 'click',
		target: 'xyz',
	});
	assert.ok(err.message.includes('Check that the element exists'));
});

test('ElementNotFoundError element state is not found', () => {
	const err = new ElementNotFoundError({
		action: 'click',
		target: 'xyz',
	});
	assert.ok(err.elementState);
	assert.equal(err.elementState.found, false);
});

// -----------------------------------------------------------------------
// ElementNotActionableError
// -----------------------------------------------------------------------

test('ElementNotActionableError — not-visible', () => {
	const err = new ElementNotActionableError({
		action: 'click',
		target: 'Button',
		reason: 'not-visible',
		elementState: { found: true, visible: false },
	});
	assert.equal(err.name, 'ElementNotActionableError');
	assert.equal(err.reason, 'not-visible');
	assert.ok(err.message.includes('not visible'));
	assert.ok(err.message.includes('CSS visibility'));
});

test('ElementNotActionableError — disabled', () => {
	const err = new ElementNotActionableError({
		action: 'click',
		target: 'Button',
		reason: 'disabled',
		elementState: { found: true, enabled: false },
	});
	assert.equal(err.reason, 'disabled');
	assert.ok(err.message.includes('disabled'));
});

test('ElementNotActionableError — obscured', () => {
	const err = new ElementNotActionableError({
		action: 'click',
		target: 'Button',
		reason: 'obscured',
		elementState: { found: true, obscured: true, obscuredBy: 'div.modal' },
	});
	assert.equal(err.reason, 'obscured');
	assert.ok(err.message.includes('obscured'));
	assert.ok(err.message.includes('div.modal'));
});

test('ElementNotActionableError — zero-size', () => {
	const err = new ElementNotActionableError({
		action: 'click',
		target: 'Button',
		reason: 'zero-size',
		elementState: { found: true, boundingBox: { x: 0, y: 0, width: 0, height: 0 } },
	});
	assert.equal(err.reason, 'zero-size');
	assert.ok(err.message.includes('zero width/height'));
});

test('ElementNotActionableError — detached', () => {
	const err = new ElementNotActionableError({
		action: 'click',
		target: 'Button',
		reason: 'detached',
		elementState: { found: true },
	});
	assert.equal(err.reason, 'detached');
	assert.ok(err.message.includes('no longer attached'));
});

// -----------------------------------------------------------------------
// NetworkError
// -----------------------------------------------------------------------

test('NetworkError has correct name', () => {
	const err = new NetworkError({
		action: 'intercept',
		target: '/api/data',
		message: 'request not matched',
	});
	assert.equal(err.name, 'NetworkError');
	assert.ok(err instanceof BrowsecraftError);
});

test('NetworkError includes hint about URL pattern', () => {
	const err = new NetworkError({
		action: 'intercept',
		target: '/api/*',
		message: 'timeout',
	});
	assert.ok(err.message.includes('URL pattern'));
});

// -----------------------------------------------------------------------
// TimeoutError
// -----------------------------------------------------------------------

test('TimeoutError has correct name', () => {
	const err = new TimeoutError({
		action: 'waitFor',
		target: '.loading',
		message: 'element not found within timeout',
		elapsed: 30_000,
	});
	assert.equal(err.name, 'TimeoutError');
	assert.ok(err instanceof BrowsecraftError);
	assert.ok(err.message.includes('30000ms'));
});

// -----------------------------------------------------------------------
// Element state formatting
// -----------------------------------------------------------------------

test('element state NOT FOUND display', () => {
	const err = new BrowsecraftError({
		action: 'click',
		target: 'X',
		message: 'missing',
		elementState: { found: false },
	});
	assert.ok(err.message.includes('NOT FOUND'));
});

test('element state shows bounding box', () => {
	const err = new BrowsecraftError({
		action: 'click',
		target: 'X',
		message: 'issue',
		elementState: {
			found: true,
			boundingBox: { x: 10, y: 20, width: 100, height: 50 },
		},
	});
	assert.ok(err.message.includes('(10, 20)'));
	assert.ok(err.message.includes('100x50'));
});

// -----------------------------------------------------------------------
// classifyFailure — failure classification
// -----------------------------------------------------------------------

test('classifies ElementNotFoundError as element + retryable', () => {
	const err = new ElementNotFoundError({
		action: 'click',
		target: '#btn',
	});
	const c = classifyFailure(err);
	assert.equal(c.category, 'element');
	assert.equal(c.retryable, true);
});

test('classifies ElementNotActionableError as actionability + retryable', () => {
	const err = new ElementNotActionableError({
		action: 'click',
		target: '#btn',
		reason: 'disabled',
		elementState: { found: true, enabled: false },
	});
	const c = classifyFailure(err);
	assert.equal(c.category, 'actionability');
	assert.equal(c.retryable, true);
});

test('classifies NetworkError as network + retryable', () => {
	const err = new NetworkError({
		action: 'goto',
		target: 'https://example.com',
		message: 'connection refused',
	});
	const c = classifyFailure(err);
	assert.equal(c.category, 'network');
	assert.equal(c.retryable, true);
});

test('classifies TimeoutError as timeout + retryable', () => {
	const err = new TimeoutError({
		action: 'click',
		target: 'Submit',
		message: 'timed out',
	});
	const c = classifyFailure(err);
	assert.equal(c.category, 'timeout');
	assert.equal(c.retryable, true);
});

test('classifies SyntaxError as script + NOT retryable', () => {
	const c = classifyFailure(new SyntaxError('unexpected token'));
	assert.equal(c.category, 'script');
	assert.equal(c.retryable, false);
});

test('classifies TypeError as script + NOT retryable', () => {
	const c = classifyFailure(new TypeError('x is not a function'));
	assert.equal(c.category, 'script');
	assert.equal(c.retryable, false);
});

test('classifies ReferenceError as script + NOT retryable', () => {
	const c = classifyFailure(new ReferenceError('x is not defined'));
	assert.equal(c.category, 'script');
	assert.equal(c.retryable, false);
});

test('classifies assertion-like message as assertion + NOT retryable', () => {
	const err = new Error('Expected 3 to equal 5');
	const c = classifyFailure(err);
	assert.equal(c.category, 'assertion');
	assert.equal(c.retryable, false);
});

test('classifies "expected to have" message as assertion', () => {
	const err = new Error('Expected page to have title "Home"');
	const c = classifyFailure(err);
	assert.equal(c.category, 'assertion');
	assert.equal(c.retryable, false);
});

test('classifies generic timeout message as timeout + retryable', () => {
	const err = new Error('Timed out after 30000ms');
	const c = classifyFailure(err);
	assert.equal(c.category, 'timeout');
	assert.equal(c.retryable, true);
});

test('classifies ECONNREFUSED as network + retryable', () => {
	const err = new Error('connect ECONNREFUSED 127.0.0.1:3000');
	const c = classifyFailure(err);
	assert.equal(c.category, 'network');
	assert.equal(c.retryable, true);
});

test('classifies unknown error as unknown + retryable', () => {
	const err = new Error('something weird happened');
	const c = classifyFailure(err);
	assert.equal(c.category, 'unknown');
	assert.equal(c.retryable, true);
});

test('classifies non-Error thrown as unknown + retryable', () => {
	const c = classifyFailure('just a string');
	assert.equal(c.category, 'unknown');
	assert.equal(c.retryable, true);
});

test('classification always returns required fields', () => {
	for (const err of [
		new Error('test'),
		new TypeError('bad'),
		new SyntaxError('oops'),
		null,
		undefined,
		42,
	]) {
		const c = classifyFailure(err);
		assert.ok(typeof c.category === 'string');
		assert.ok(typeof c.retryable === 'boolean');
		assert.ok(typeof c.description === 'string');
	}
});

// -----------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------

console.log(`\n  Errors: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
