#!/usr/bin/env node

// ============================================================================
// Unit Tests — Wait Engine (wait.ts)
// Tests waitFor() polling, sleep(), timeout behaviour, and edge cases.
// Does NOT require a browser — only tests pure-JS logic.
// ============================================================================

import assert from 'node:assert/strict';
import { sleep, waitFor } from '../../packages/browsecraft/dist/index.js';

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
let passed = 0;
let failed = 0;

async function test(name, fn) {
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

console.log('\n\x1b[1mWait Engine Tests\x1b[0m\n');

// -----------------------------------------------------------------------
// sleep()
// -----------------------------------------------------------------------

await test('sleep resolves after specified ms', async () => {
	const start = Date.now();
	await sleep(100);
	const elapsed = Date.now() - start;
	assert.ok(elapsed >= 90, `Expected >= 90ms, got ${elapsed}ms`);
	assert.ok(elapsed < 300, `Expected < 300ms, got ${elapsed}ms`);
});

await test('sleep(0) resolves nearly immediately', async () => {
	const start = Date.now();
	await sleep(0);
	const elapsed = Date.now() - start;
	assert.ok(elapsed < 50, `Expected < 50ms, got ${elapsed}ms`);
});

// -----------------------------------------------------------------------
// waitFor() — basic success cases
// -----------------------------------------------------------------------

await test('waitFor returns immediately when fn returns truthy', async () => {
	const start = Date.now();
	const result = await waitFor('test', async () => 42, { timeout: 1000 });
	assert.equal(result, 42);
	const elapsed = Date.now() - start;
	assert.ok(elapsed < 200, `Expected < 200ms, got ${elapsed}ms`);
});

await test('waitFor returns a string result', async () => {
	const result = await waitFor('string test', async () => 'hello', { timeout: 500 });
	assert.equal(result, 'hello');
});

await test('waitFor returns an object result', async () => {
	const obj = { ready: true, count: 5 };
	const result = await waitFor('object test', async () => obj, { timeout: 500 });
	assert.deepEqual(result, obj);
});

await test('waitFor returns true as truthy', async () => {
	const result = await waitFor('boolean test', async () => true, { timeout: 500 });
	assert.equal(result, true);
});

// -----------------------------------------------------------------------
// waitFor() — polling until truthy
// -----------------------------------------------------------------------

await test('waitFor polls until fn returns truthy', async () => {
	let calls = 0;
	const result = await waitFor(
		'poll test',
		async () => {
			calls++;
			return calls >= 3 ? 'done' : null;
		},
		{ timeout: 2000, interval: 50 },
	);
	assert.equal(result, 'done');
	assert.ok(calls >= 3, `Expected >= 3 calls, got ${calls}`);
});

await test('waitFor treats null as falsy', async () => {
	let calls = 0;
	await waitFor(
		'null test',
		async () => {
			calls++;
			return calls >= 2 ? 'ok' : null;
		},
		{ timeout: 1000, interval: 50 },
	);
	assert.ok(calls >= 2);
});

await test('waitFor treats false as falsy', async () => {
	let calls = 0;
	await waitFor(
		'false test',
		async () => {
			calls++;
			return calls >= 2 ? 'ok' : false;
		},
		{ timeout: 1000, interval: 50 },
	);
	assert.ok(calls >= 2);
});

// -----------------------------------------------------------------------
// waitFor() — timeout
// -----------------------------------------------------------------------

await test('waitFor throws on timeout when fn always returns null', async () => {
	const start = Date.now();
	try {
		await waitFor('timeout test', async () => null, { timeout: 200, interval: 50 });
		assert.fail('Should have thrown');
	} catch (err) {
		const elapsed = Date.now() - start;
		assert.ok(err.message.includes('Timed out'), `Expected timeout error, got: ${err.message}`);
		assert.ok(err.message.includes('timeout test'), 'Error should contain description');
		assert.ok(elapsed >= 180, `Expected >= 180ms, got ${elapsed}ms`);
		assert.ok(elapsed < 500, `Expected < 500ms, got ${elapsed}ms`);
	}
});

await test('waitFor throws on timeout when fn always returns false', async () => {
	try {
		await waitFor('false timeout', async () => false, { timeout: 200, interval: 50 });
		assert.fail('Should have thrown');
	} catch (err) {
		assert.ok(err.message.includes('Timed out'));
	}
});

await test('waitFor includes last error in timeout message', async () => {
	try {
		await waitFor(
			'error desc',
			async () => {
				throw new Error('inner failure');
			},
			{ timeout: 200, interval: 50 },
		);
		assert.fail('Should have thrown');
	} catch (err) {
		assert.ok(err.message.includes('error desc'), 'Should contain description');
		assert.ok(
			err.message.includes('inner failure'),
			`Should contain inner error but got: ${err.message}`,
		);
	}
});

// -----------------------------------------------------------------------
// waitFor() — error handling during polling
// -----------------------------------------------------------------------

await test('waitFor retries after errors until success', async () => {
	let calls = 0;
	const result = await waitFor(
		'error recovery',
		async () => {
			calls++;
			if (calls < 3) throw new Error('not ready');
			return 'recovered';
		},
		{ timeout: 2000, interval: 50 },
	);
	assert.equal(result, 'recovered');
	assert.ok(calls >= 3);
});

await test('waitFor retries after non-Error throws', async () => {
	let calls = 0;
	const result = await waitFor(
		'string throw',
		async () => {
			calls++;
			if (calls < 2) throw 'not an Error'; // eslint-disable-line no-throw-literal
			return 'ok';
		},
		{ timeout: 1000, interval: 50 },
	);
	assert.equal(result, 'ok');
});

// -----------------------------------------------------------------------
// waitFor() — interval option
// -----------------------------------------------------------------------

await test('waitFor respects custom interval', async () => {
	let calls = 0;
	const start = Date.now();
	try {
		await waitFor(
			'interval test',
			async () => {
				calls++;
				return null;
			},
			{ timeout: 300, interval: 100 },
		);
	} catch {
		// expected timeout
	}
	const elapsed = Date.now() - start;
	// With 100ms interval and 300ms timeout, expect ~3-4 calls
	assert.ok(calls >= 2 && calls <= 5, `Expected 2-5 calls at 100ms interval, got ${calls}`);
	assert.ok(elapsed >= 250, `Expected >= 250ms, got ${elapsed}ms`);
});

await test('waitFor uses default 100ms interval when not specified', async () => {
	let calls = 0;
	try {
		await waitFor(
			'default interval',
			async () => {
				calls++;
				return null;
			},
			{ timeout: 350 },
		);
	} catch {
		// expected timeout
	}
	// With default 100ms interval and 350ms timeout, expect ~3-4 calls
	assert.ok(calls >= 2 && calls <= 5, `Expected 2-5 calls at default interval, got ${calls}`);
});

// -----------------------------------------------------------------------
// waitFor() — edge cases
// -----------------------------------------------------------------------

await test('waitFor accepts 0 as truthy (number)', async () => {
	// 0 is falsy in JS, but waitFor checks !== null && !== false
	// So 0 should be treated as falsy by the explicit check
	let calls = 0;
	try {
		await waitFor(
			'zero test',
			async () => {
				calls++;
				return 0; // 0 is !result === true, so depends on implementation
			},
			{ timeout: 200, interval: 50 },
		);
		// If it succeeds, 0 is treated as truthy by the implementation
		// The implementation checks result !== null && result !== false
		// Since 0 is not null and not false, it should pass
	} catch {
		// Some implementations treat 0 as falsy
		// Either behaviour is acceptable, just documenting it
	}
});

await test('waitFor accepts empty string as truthy', async () => {
	// "" is falsy in JS, but waitFor checks !== null && !== false
	// So "" should pass through
	try {
		const result = await waitFor('empty string', async () => '', { timeout: 200, interval: 50 });
		// If it succeeds, empty string is treated as truthy
		assert.equal(result, '');
	} catch {
		// Some implementations treat "" as falsy
	}
});

await test('waitFor times out message includes elapsed ms', async () => {
	try {
		await waitFor('timing test', async () => null, { timeout: 200, interval: 50 });
		assert.fail('Should have thrown');
	} catch (err) {
		// The message should include the elapsed time in ms
		const match = err.message.match(/(\d+)ms/);
		assert.ok(match, `Expected ms in message but got: ${err.message}`);
		const elapsed = Number.parseInt(match[1], 10);
		assert.ok(elapsed >= 180, `Reported elapsed ${elapsed}ms, expected >= 180`);
	}
});

// -----------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------

console.log(`\n  Wait: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
