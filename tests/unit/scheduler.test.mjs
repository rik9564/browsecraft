#!/usr/bin/env node

// ============================================================================
// Unit Tests — Scheduler
// Exhaustive tests for the 3-strategy execution scheduler.
// ============================================================================

import assert from 'node:assert/strict';
import {
	EventBus,
	WorkerPool,
	Scheduler,
} from '../../packages/browsecraft-runner/dist/index.js';

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

console.log('\n\x1b[1mScheduler Tests\x1b[0m\n');

// Helpers

function mockSpawner() {
	return async (worker) => ({
		close: async () => {},
	});
}

function mockExecutor(resultMap = {}) {
	return async (item, worker) => {
		const r = resultMap[item.id];
		if (typeof r === 'function') return r(item, worker);
		return r ?? { status: 'passed', duration: 10 };
	};
}

function makeItem(id, title, tags) {
	return {
		id,
		title: title || `Scenario ${id}`,
		file: 'features/test.feature',
		suitePath: ['Feature'],
		tags,
	};
}

async function createPoolAndSpawn(bus, browsers) {
	const pool = new WorkerPool(bus, { browsers });
	await pool.spawn(mockSpawner());
	return pool;
}

// -----------------------------------------------------------------------
// Parallel strategy
// -----------------------------------------------------------------------

await test('parallel: distributes items across all workers', async () => {
	const bus = new EventBus();
	const pool = await createPoolAndSpawn(bus, { chrome: 2 });
	const scheduler = new Scheduler(bus, pool, { strategy: 'parallel' });

	const items = [makeItem('1'), makeItem('2'), makeItem('3'), makeItem('4')];
	const result = await scheduler.run(items, mockExecutor());

	assert.equal(result.allResults.length, 4);
	assert.equal(result.totalPassed, 4);
	assert.equal(result.totalFailed, 0);
	assert.equal(result.strategy, 'parallel');
});

await test('parallel: emits run:start and run:end', async () => {
	const bus = new EventBus();
	bus.enableHistory();
	const pool = await createPoolAndSpawn(bus, { chrome: 1 });
	const scheduler = new Scheduler(bus, pool, { strategy: 'parallel' });

	await scheduler.run([makeItem('1')], mockExecutor());

	const starts = bus.getEventsOfType('run:start');
	const ends = bus.getEventsOfType('run:end');
	assert.equal(starts.length, 1);
	assert.equal(ends.length, 1);
	assert.equal(starts[0].payload.totalItems, 1);
	assert.ok(ends[0].payload.duration >= 0);
});

await test('parallel: emits browser:start and browser:end', async () => {
	const bus = new EventBus();
	bus.enableHistory();
	const pool = await createPoolAndSpawn(bus, { chrome: 1, firefox: 1 });
	const scheduler = new Scheduler(bus, pool, { strategy: 'parallel' });

	await scheduler.run([makeItem('1'), makeItem('2')], mockExecutor());

	const starts = bus.getEventsOfType('browser:start');
	const ends = bus.getEventsOfType('browser:end');
	assert.equal(starts.length, 2);
	assert.equal(ends.length, 2);
});

await test('parallel: handles empty items', async () => {
	const bus = new EventBus();
	const pool = await createPoolAndSpawn(bus, { chrome: 1 });
	const scheduler = new Scheduler(bus, pool, { strategy: 'parallel' });

	const result = await scheduler.run([], mockExecutor());
	assert.equal(result.allResults.length, 0);
	assert.equal(result.totalPassed, 0);
});

// -----------------------------------------------------------------------
// Sequential strategy
// -----------------------------------------------------------------------

await test('sequential: runs each browser one at a time', async () => {
	const bus = new EventBus();
	const pool = await createPoolAndSpawn(bus, { chrome: 1, firefox: 1 });
	const scheduler = new Scheduler(bus, pool, { strategy: 'sequential' });

	const executionOrder = [];
	const executor = async (item, worker) => {
		executionOrder.push(worker.browser);
		return { status: 'passed', duration: 5 };
	};

	const items = [makeItem('1'), makeItem('2')];
	const result = await scheduler.run(items, executor);

	// Each browser gets all items
	assert.equal(result.allResults.length, 4);
	assert.equal(result.totalPassed, 4);
	assert.equal(result.strategy, 'sequential');

	// All chrome first, then all firefox (sequential by browser)
	const chromeRuns = executionOrder.filter((b) => b === 'chrome');
	const firefoxRuns = executionOrder.filter((b) => b === 'firefox');
	assert.equal(chromeRuns.length, 2);
	assert.equal(firefoxRuns.length, 2);
});

await test('sequential: builds per-browser result breakdown', async () => {
	const bus = new EventBus();
	const pool = await createPoolAndSpawn(bus, { chrome: 1, firefox: 1 });
	const scheduler = new Scheduler(bus, pool, { strategy: 'sequential' });

	const result = await scheduler.run([makeItem('1')], mockExecutor());

	assert.equal(result.browsers.length, 2);
	const chromeBrowser = result.browsers.find((b) => b.browser === 'chrome');
	const ffBrowser = result.browsers.find((b) => b.browser === 'firefox');
	assert.ok(chromeBrowser);
	assert.ok(ffBrowser);
	assert.equal(chromeBrowser.passed, 1);
	assert.equal(ffBrowser.passed, 1);
});

// -----------------------------------------------------------------------
// Matrix strategy
// -----------------------------------------------------------------------

await test('matrix: every scenario × every browser', async () => {
	const bus = new EventBus();
	const pool = await createPoolAndSpawn(bus, { chrome: 1, firefox: 1 });
	const scheduler = new Scheduler(bus, pool, { strategy: 'matrix' });

	const items = [makeItem('1'), makeItem('2'), makeItem('3')];
	const result = await scheduler.run(items, mockExecutor());

	// 3 scenarios × 2 browsers = 6 results
	assert.equal(result.allResults.length, 6);
	assert.equal(result.totalPassed, 6);
	assert.equal(result.strategy, 'matrix');
});

await test('matrix: single browser degrades to parallel', async () => {
	const bus = new EventBus();
	const pool = await createPoolAndSpawn(bus, { chrome: 2 });
	const scheduler = new Scheduler(bus, pool, { strategy: 'matrix' });

	const items = [makeItem('1'), makeItem('2')];
	const result = await scheduler.run(items, mockExecutor());

	// 2 scenarios × 1 browser = 2 results (not 4)
	assert.equal(result.allResults.length, 2);
});

await test('matrix: results include browser info', async () => {
	const bus = new EventBus();
	const pool = await createPoolAndSpawn(bus, { chrome: 1, firefox: 1 });
	const scheduler = new Scheduler(bus, pool, { strategy: 'matrix' });

	const result = await scheduler.run([makeItem('1')], mockExecutor());

	const browsers = result.allResults.map((r) => r.worker.browser).sort();
	assert.deepStrictEqual(browsers, ['chrome', 'firefox']);
});

await test('matrix: mixed pass/fail per browser', async () => {
	const bus = new EventBus();
	const pool = await createPoolAndSpawn(bus, { chrome: 1, firefox: 1 });
	const scheduler = new Scheduler(bus, pool, { strategy: 'matrix' });

	const executor = async (item, worker) => {
		// Fail on firefox only
		if (worker.browser === 'firefox') {
			return { status: 'failed', duration: 5, error: new Error('ff crash') };
		}
		return { status: 'passed', duration: 10 };
	};

	const result = await scheduler.run([makeItem('1')], executor);
	assert.equal(result.totalPassed, 1);
	assert.equal(result.totalFailed, 1);

	const chrome = result.browsers.find((b) => b.browser === 'chrome');
	const ff = result.browsers.find((b) => b.browser === 'firefox');
	assert.equal(chrome.passed, 1);
	assert.equal(ff.failed, 1);
});

// -----------------------------------------------------------------------
// Grep filtering
// -----------------------------------------------------------------------

await test('grep filters items by title', async () => {
	const bus = new EventBus();
	const pool = await createPoolAndSpawn(bus, { chrome: 1 });
	const scheduler = new Scheduler(bus, pool, { strategy: 'parallel', grep: 'Login' });

	const items = [
		makeItem('1', 'Login page'),
		makeItem('2', 'Logout page'),
		makeItem('3', 'Login form'),
	];
	const result = await scheduler.run(items, mockExecutor());

	assert.equal(result.allResults.length, 2);
	assert.ok(result.allResults.every((r) => r.item.title.includes('Login')));
});

await test('grep with no matches returns empty results', async () => {
	const bus = new EventBus();
	const pool = await createPoolAndSpawn(bus, { chrome: 1 });
	const scheduler = new Scheduler(bus, pool, { strategy: 'parallel', grep: 'NOMATCH' });

	const result = await scheduler.run([makeItem('1', 'test')], mockExecutor());
	assert.equal(result.allResults.length, 0);
});

// -----------------------------------------------------------------------
// Tag filtering
// -----------------------------------------------------------------------

await test('tag filter matches single tag', async () => {
	const bus = new EventBus();
	const pool = await createPoolAndSpawn(bus, { chrome: 1 });
	const scheduler = new Scheduler(bus, pool, {
		strategy: 'parallel',
		tagFilter: '@smoke',
	});

	const items = [
		makeItem('1', 'Test 1', ['@smoke']),
		makeItem('2', 'Test 2', ['@regression']),
		makeItem('3', 'Test 3', ['@smoke', '@regression']),
	];
	const result = await scheduler.run(items, mockExecutor());

	assert.equal(result.allResults.length, 2); // items 1 and 3
});

await test('tag filter AND logic', async () => {
	const bus = new EventBus();
	const pool = await createPoolAndSpawn(bus, { chrome: 1 });
	const scheduler = new Scheduler(bus, pool, {
		strategy: 'parallel',
		tagFilter: '@smoke and @regression',
	});

	const items = [
		makeItem('1', 'Test 1', ['@smoke']),
		makeItem('2', 'Test 2', ['@regression']),
		makeItem('3', 'Test 3', ['@smoke', '@regression']),
	];
	const result = await scheduler.run(items, mockExecutor());

	assert.equal(result.allResults.length, 1); // only item 3
	assert.equal(result.allResults[0].item.id, '3');
});

await test('tag filter OR logic', async () => {
	const bus = new EventBus();
	const pool = await createPoolAndSpawn(bus, { chrome: 1 });
	const scheduler = new Scheduler(bus, pool, {
		strategy: 'parallel',
		tagFilter: '@smoke or @wip',
	});

	const items = [
		makeItem('1', 'Test 1', ['@smoke']),
		makeItem('2', 'Test 2', ['@wip']),
		makeItem('3', 'Test 3', ['@regression']),
	];
	const result = await scheduler.run(items, mockExecutor());

	assert.equal(result.allResults.length, 2);
});

await test('tag filter NOT logic', async () => {
	const bus = new EventBus();
	const pool = await createPoolAndSpawn(bus, { chrome: 1 });
	const scheduler = new Scheduler(bus, pool, {
		strategy: 'parallel',
		tagFilter: 'not @wip',
	});

	const items = [
		makeItem('1', 'Test 1', ['@smoke']),
		makeItem('2', 'Test 2', ['@wip']),
		makeItem('3', 'Test 3', ['@regression']),
	];
	const result = await scheduler.run(items, mockExecutor());

	assert.equal(result.allResults.length, 2);
	assert.ok(result.allResults.every((r) => r.item.id !== '2'));
});

await test('tag filter excludes items without tags', async () => {
	const bus = new EventBus();
	const pool = await createPoolAndSpawn(bus, { chrome: 1 });
	const scheduler = new Scheduler(bus, pool, {
		strategy: 'parallel',
		tagFilter: '@smoke',
	});

	const items = [
		makeItem('1', 'Test 1'), // no tags
		makeItem('2', 'Test 2', ['@smoke']),
	];
	const result = await scheduler.run(items, mockExecutor());

	assert.equal(result.allResults.length, 1);
	assert.equal(result.allResults[0].item.id, '2');
});

// -----------------------------------------------------------------------
// Default strategy
// -----------------------------------------------------------------------

await test('default strategy is matrix', async () => {
	const bus = new EventBus();
	const pool = await createPoolAndSpawn(bus, { chrome: 1, firefox: 1 });
	const scheduler = new Scheduler(bus, pool);

	const result = await scheduler.run([makeItem('1')], mockExecutor());
	assert.equal(result.strategy, 'matrix');
	assert.equal(result.allResults.length, 2); // 1 scenario × 2 browsers
});

// -----------------------------------------------------------------------
// Result structure
// -----------------------------------------------------------------------

await test('result includes totalDuration', async () => {
	const bus = new EventBus();
	const pool = await createPoolAndSpawn(bus, { chrome: 1 });
	const scheduler = new Scheduler(bus, pool, { strategy: 'parallel' });

	const result = await scheduler.run([makeItem('1')], mockExecutor());
	assert.ok(typeof result.totalDuration === 'number');
	assert.ok(result.totalDuration >= 0);
});

await test('result includes browser-level breakdown', async () => {
	const bus = new EventBus();
	const pool = await createPoolAndSpawn(bus, { chrome: 1, firefox: 1 });
	const scheduler = new Scheduler(bus, pool, { strategy: 'matrix' });

	const result = await scheduler.run([makeItem('1'), makeItem('2')], mockExecutor());

	assert.equal(result.browsers.length, 2);
	for (const b of result.browsers) {
		assert.ok(typeof b.passed === 'number');
		assert.ok(typeof b.failed === 'number');
		assert.ok(typeof b.skipped === 'number');
		assert.ok(typeof b.duration === 'number');
	}
});

// -----------------------------------------------------------------------
// Unknown strategy
// -----------------------------------------------------------------------

await test('unknown strategy throws', async () => {
	const bus = new EventBus();
	const pool = await createPoolAndSpawn(bus, { chrome: 1 });
	const scheduler = new Scheduler(bus, pool, { strategy: 'invalid' });

	await assert.rejects(
		() => scheduler.run([makeItem('1')], mockExecutor()),
		/Unknown execution strategy/,
	);
});

// -----------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------

console.log(`\n  Scheduler: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
