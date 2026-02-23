#!/usr/bin/env node

// ============================================================================
// Unit Tests — sanitize() utility (debug log redaction)
// Ensures sensitive data (passwords, tokens, cookies, auth headers) is redacted
// before appearing in debug output.
// ============================================================================

import assert from 'node:assert/strict';
import { sanitize } from '../../packages/browsecraft-bidi/dist/index.js';

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

console.log('\nsanitize()');

// --------------------------------------------------------------------------
// Direct key redaction
// --------------------------------------------------------------------------

test('should redact sensitive keys in objects', () => {
	const input = { id: 1, password: 'my-secret-password', other: 'value' };
	const result = sanitize(input);
	assert.deepStrictEqual(result, { id: 1, password: '[REDACTED]', other: 'value' });
});

test('should redact sensitive keys in nested objects', () => {
	const input = {
		params: {
			credentials: {
				username: 'admin',
				password: 'secret-password',
			},
		},
	};
	const result = sanitize(input);
	assert.equal(result.params.credentials.username, 'admin');
	assert.equal(result.params.credentials.password, '[REDACTED]');
});

test('should redact tokens and secrets', () => {
	const input = { apiToken: 'abc-123', appSecret: 'shhh' };
	const result = sanitize(input);
	assert.deepStrictEqual(result, { apiToken: '[REDACTED]', appSecret: '[REDACTED]' });
});

test('should redact sessions', () => {
	const input = { sessionId: 'abc-123', userSession: 'xyz-789' };
	const result = sanitize(input);
	assert.deepStrictEqual(result, { sessionId: '[REDACTED]', userSession: '[REDACTED]' });
});

// --------------------------------------------------------------------------
// Header / Cookie redaction
// --------------------------------------------------------------------------

test('should redact Authorization header values', () => {
	const input = {
		method: 'network.continueRequest',
		params: {
			headers: [
				{ name: 'Content-Type', value: 'application/json' },
				{ name: 'Authorization', value: 'Bearer secret-token' },
			],
		},
	};
	const result = sanitize(input);
	assert.equal(result.params.headers[0].value, 'application/json');
	assert.equal(result.params.headers[1].value, '[REDACTED]');
});

test('should redact Authorization header values in BiDi RemoteValue format', () => {
	const input = {
		name: 'Authorization',
		value: { type: 'string', value: 'Bearer secret-token' },
	};
	const result = sanitize(input);
	assert.deepStrictEqual(result.value, { type: 'string', value: '[REDACTED]' });
});

test('should redact Cookie header values', () => {
	const input = { name: 'Cookie', value: 'session=123456' };
	const result = sanitize(input);
	assert.equal(result.value, '[REDACTED]');
});

// --------------------------------------------------------------------------
// Non-sensitive data
// --------------------------------------------------------------------------

test('should not redact insensitive keys', () => {
	const input = {
		id: 123,
		method: 'browsingContext.navigate',
		params: { url: 'https://example.com' },
	};
	const result = sanitize(input);
	assert.deepStrictEqual(result, input);
});

// --------------------------------------------------------------------------
// Arrays
// --------------------------------------------------------------------------

test('should handle arrays and redact their elements', () => {
	const input = [{ password: 'p1' }, { name: 'Authorization', value: 'v1' }];
	const result = sanitize(input);
	assert.deepStrictEqual(result, [
		{ password: '[REDACTED]' },
		{ name: 'Authorization', value: '[REDACTED]' },
	]);
});

test('should recurse into array values without redacting the array itself', () => {
	const input = {
		cookies: [{ name: 'session', value: 'secret' }],
	};
	const result = sanitize(input);
	// The array should not be replaced — individual elements are recursed
	assert.ok(Array.isArray(result.cookies));
	assert.equal(result.cookies[0].value, '[REDACTED]');
});

// --------------------------------------------------------------------------
// Edge cases
// --------------------------------------------------------------------------

test('should return primitives as-is', () => {
	assert.equal(sanitize(null), null);
	assert.equal(sanitize(42), 42);
	assert.equal(sanitize('hello'), 'hello');
	assert.equal(sanitize(undefined), undefined);
});

test('should handle empty objects', () => {
	assert.deepStrictEqual(sanitize({}), {});
});

test('should handle empty arrays', () => {
	assert.deepStrictEqual(sanitize([]), []);
});

// --------------------------------------------------------------------------
// Summary
// --------------------------------------------------------------------------

console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
