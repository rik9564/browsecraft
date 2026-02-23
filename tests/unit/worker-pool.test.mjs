#!/usr/bin/env node

// ============================================================================
// Unit Tests — WorkerPool
// Exhaustive tests for the browser worker pool and work-stealing execution.
// ============================================================================

import assert from 'node:assert/strict';
import { EventBus, WorkerPool } from '../../packages/browsecraft-runner/dist/index.js';

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

console.log('\n\x1b[1mWorkerPool Tests\x1b[0m\n');

// Mock spawner factory
function mockSpawner(delay = 0) {
	const closed = [];
	return {
		spawner: async (worker) => {
			if (delay > 0) await new Promise((r) => setTimeout(r, delay));
			return {
				close: async () => {
					closed.push(worker.id);
				},
			};
		},
		closed,
	};
}

// Mock executor factory
function mockExecutor(results = {}) {
	return async (item, worker) => {
		const r = results[item.id] ?? { status: 'passed', duration: 10 };
		if (typeof r === 'function') return r(item, worker);
		return r;
	};
}

// Work item factory
function makeItem(id, title, tags) {
	return { id, title: title || `Test ${id}`, file: 'test.ts', suitePath: ['Suite'], tags };
}

// -----------------------------------------------------------------------
// Constructor & defaults
// -----------------------------------------------------------------------

await test('default config is chrome:1', () => {
	const bus = new EventBus();
	const pool = new WorkerPool(bus);
	assert.equal(pool.size, 0); // no workers until spawn()
});

// -----------------------------------------------------------------------
// spawn()
// -----------------------------------------------------------------------

await test('spawn creates workers from config', async () => {
	const bus = new EventBus();
	const pool = new WorkerPool(bus, { browsers: { chrome: 2, firefox: 1 } });
	const { spawner } = mockSpawner();
	await pool.spawn(spawner);

	assert.equal(pool.size, 3);
	assert.equal(pool.browserCount, 2);
});

await test('spawn emits worker:spawn and worker:ready', async () => {
	const bus = new EventBus();
	bus.enableHistory();
	const pool = new WorkerPool(bus, { browsers: { chrome: 1 } });
	const { spawner } = mockSpawner();
	await pool.spawn(spawner);

	const spawns = bus.getEventsOfType('worker:spawn');
	const readys = bus.getEventsOfType('worker:ready');
	assert.equal(spawns.length, 1);
	assert.equal(readys.length, 1);
	assert.equal(spawns[0].payload.id, 'chrome-0');
});

await test('spawn emits worker:error on failure', async () => {
	const bus = new EventBus();
	bus.enableHistory();
	const pool = new WorkerPool(bus, { browsers: { chrome: 1 } });

	try {
		await pool.spawn(async () => {
			throw new Error('launch fail');
		});
	} catch {
		/* expected */
	}

	const errors = bus.getEventsOfType('worker:error');
	assert.equal(errors.length, 1);
	assert.equal(errors[0].payload.error.message, 'launch fail');
});

await test('getWorkers returns all workers', async () => {
	const bus = new EventBus();
	const pool = new WorkerPool(bus, { browsers: { chrome: 2 } });
	const { spawner } = mockSpawner();
	await pool.spawn(spawner);

	const workers = pool.getWorkers();
	assert.equal(workers.length, 2);
	assert.equal(workers[0].info.id, 'chrome-0');
	assert.equal(workers[1].info.id, 'chrome-1');
});

await test('getWorkersForBrowser filters by browser', async () => {
	const bus = new EventBus();
	const pool = new WorkerPool(bus, { browsers: { chrome: 2, firefox: 1 } });
	const { spawner } = mockSpawner();
	await pool.spawn(spawner);

	const ff = pool.getWorkersForBrowser('firefox');
	assert.equal(ff.length, 1);
	assert.equal(ff[0].info.browser, 'firefox');
});

await test('getIdleWorkers returns idle workers after spawn', async () => {
	const bus = new EventBus();
	const pool = new WorkerPool(bus, { browsers: { chrome: 2 } });
	const { spawner } = mockSpawner();
	await pool.spawn(spawner);

	assert.equal(pool.getIdleWorkers().length, 2);
});

await test('browserNames returns distinct browser names', async () => {
	const bus = new EventBus();
	const pool = new WorkerPool(bus, { browsers: { chrome: 1, firefox: 1, edge: 1 } });
	const { spawner } = mockSpawner();
	await pool.spawn(spawner);

	const names = pool.browserNames.sort();
	assert.deepStrictEqual(names, ['chrome', 'edge', 'firefox']);
});

// -----------------------------------------------------------------------
// execute()
// -----------------------------------------------------------------------

await test('execute distributes items across workers', async () => {
	const bus = new EventBus();
	const pool = new WorkerPool(bus, { browsers: { chrome: 2 } });
	const { spawner } = mockSpawner();
	await pool.spawn(spawner);

	const items = [makeItem('1'), makeItem('2'), makeItem('3'), makeItem('4')];
	const executor = mockExecutor();
	const results = await pool.execute(items, executor);

	assert.equal(results.length, 4);
	assert.ok(results.every((r) => r.status === 'passed'));
});

await test('execute returns empty array for empty items', async () => {
	const bus = new EventBus();
	const pool = new WorkerPool(bus, { browsers: { chrome: 1 } });
	const { spawner } = mockSpawner();
	await pool.spawn(spawner);

	const results = await pool.execute([], mockExecutor());
	assert.deepStrictEqual(results, []);
});

await test('execute throws if no workers are idle', async () => {
	const bus = new EventBus();
	const pool = new WorkerPool(bus); // no spawn called
	await assert.rejects(() => pool.execute([makeItem('1')], mockExecutor()), /No active workers/);
});

await test('execute emits item lifecycle events', async () => {
	const bus = new EventBus();
	bus.enableHistory();
	const pool = new WorkerPool(bus, { browsers: { chrome: 1 } });
	const { spawner } = mockSpawner();
	await pool.spawn(spawner);

	await pool.execute([makeItem('1')], mockExecutor());

	const enqueues = bus.getEventsOfType('item:enqueue');
	const starts = bus.getEventsOfType('item:start');
	const passes = bus.getEventsOfType('item:pass');
	const ends = bus.getEventsOfType('item:end');

	assert.equal(enqueues.length, 1);
	assert.equal(starts.length, 1);
	assert.equal(passes.length, 1);
	assert.equal(ends.length, 1);
});

await test('execute emits item:fail for failed items', async () => {
	const bus = new EventBus();
	bus.enableHistory();
	const pool = new WorkerPool(bus, { browsers: { chrome: 1 } });
	const { spawner } = mockSpawner();
	await pool.spawn(spawner);

	const executor = mockExecutor({ 1: { status: 'failed', duration: 5, error: new Error('boom') } });
	await pool.execute([makeItem('1')], executor);

	const fails = bus.getEventsOfType('item:fail');
	assert.equal(fails.length, 1);
	assert.equal(fails[0].payload.error.message, 'boom');
});

await test('execute emits item:skip for skipped items', async () => {
	const bus = new EventBus();
	bus.enableHistory();
	const pool = new WorkerPool(bus, { browsers: { chrome: 1 } });
	const { spawner } = mockSpawner();
	await pool.spawn(spawner);

	const executor = mockExecutor({ 1: { status: 'skipped', duration: 0 } });
	await pool.execute([makeItem('1')], executor);

	const skips = bus.getEventsOfType('item:skip');
	assert.equal(skips.length, 1);
});

// -----------------------------------------------------------------------
// Retries
// -----------------------------------------------------------------------

await test('retries failed items up to maxRetries', async () => {
	const bus = new EventBus();
	bus.enableHistory();
	const pool = new WorkerPool(bus, { browsers: { chrome: 1 }, maxRetries: 2 });
	const { spawner } = mockSpawner();
	await pool.spawn(spawner);

	let attempts = 0;
	const executor = async (item) => {
		attempts++;
		if (attempts < 3) return { status: 'failed', duration: 5, error: new Error('flaky') };
		return { status: 'passed', duration: 10 };
	};

	const results = await pool.execute([makeItem('1')], executor);
	assert.equal(results.length, 1);
	assert.equal(results[0].status, 'passed');
	assert.equal(results[0].retries, 2);
	assert.equal(attempts, 3); // 1 original + 2 retries

	const retries = bus.getEventsOfType('item:retry');
	assert.equal(retries.length, 2);
});

await test('retries stop when max reached and result is still failed', async () => {
	const bus = new EventBus();
	const pool = new WorkerPool(bus, { browsers: { chrome: 1 }, maxRetries: 1 });
	const { spawner } = mockSpawner();
	await pool.spawn(spawner);

	const executor = async () => ({ status: 'failed', duration: 5, error: new Error('permanent') });
	const results = await pool.execute([makeItem('1')], executor);
	assert.equal(results[0].status, 'failed');
	assert.equal(results[0].retries, 1);
});

await test('no retries for passed items', async () => {
	const bus = new EventBus();
	bus.enableHistory();
	const pool = new WorkerPool(bus, { browsers: { chrome: 1 }, maxRetries: 3 });
	const { spawner } = mockSpawner();
	await pool.spawn(spawner);

	await pool.execute([makeItem('1')], mockExecutor());
	const retries = bus.getEventsOfType('item:retry');
	assert.equal(retries.length, 0);
});

// -----------------------------------------------------------------------
// Bail
// -----------------------------------------------------------------------

await test('bail stops execution on first failure', async () => {
	const bus = new EventBus();
	const pool = new WorkerPool(bus, { browsers: { chrome: 1 }, bail: true });
	const { spawner } = mockSpawner();
	await pool.spawn(spawner);

	const items = [makeItem('1'), makeItem('2'), makeItem('3')];
	const executor = mockExecutor({
		1: { status: 'failed', duration: 5, error: new Error('bail') },
	});
	const results = await pool.execute(items, executor);

	// Only 1 item should have run
	assert.equal(results.length, 1);
	assert.equal(results[0].status, 'failed');
});

// -----------------------------------------------------------------------
// executeOnBrowser
// -----------------------------------------------------------------------

await test('executeOnBrowser runs only on specified browser', async () => {
	const bus = new EventBus();
	bus.enableHistory();
	const pool = new WorkerPool(bus, { browsers: { chrome: 1, firefox: 1 } });
	const { spawner } = mockSpawner();
	await pool.spawn(spawner);

	const items = [makeItem('1'), makeItem('2')];
	const results = await pool.executeOnBrowser('firefox', items, mockExecutor());

	assert.equal(results.length, 2);
	assert.ok(results.every((r) => r.worker.browser === 'firefox'));
});

await test('executeOnBrowser throws for missing browser', async () => {
	const bus = new EventBus();
	const pool = new WorkerPool(bus, { browsers: { chrome: 1 } });
	const { spawner } = mockSpawner();
	await pool.spawn(spawner);

	await assert.rejects(
		() => pool.executeOnBrowser('firefox', [makeItem('1')], mockExecutor()),
		/No active workers for browser: firefox/,
	);
});

// -----------------------------------------------------------------------
// terminate()
// -----------------------------------------------------------------------

await test('terminate calls cleanup on all workers', async () => {
	const bus = new EventBus();
	const pool = new WorkerPool(bus, { browsers: { chrome: 2 } });
	const { spawner, closed } = mockSpawner();
	await pool.spawn(spawner);
	await pool.terminate();

	assert.deepStrictEqual(closed.sort(), ['chrome-0', 'chrome-1']);
});

await test('terminate emits worker:terminate for each worker', async () => {
	const bus = new EventBus();
	bus.enableHistory();
	const pool = new WorkerPool(bus, { browsers: { chrome: 1, firefox: 1 } });
	const { spawner } = mockSpawner();
	await pool.spawn(spawner);
	await pool.terminate();

	const terms = bus.getEventsOfType('worker:terminate');
	assert.equal(terms.length, 2);
});

await test('terminate sets worker state to terminated', async () => {
	const bus = new EventBus();
	const pool = new WorkerPool(bus, { browsers: { chrome: 1 } });
	const { spawner } = mockSpawner();
	await pool.spawn(spawner);
	await pool.terminate();

	assert.equal(pool.getWorkers()[0].state, 'terminated');
});

// -----------------------------------------------------------------------
// reset()
// -----------------------------------------------------------------------

await test('reset clears all workers', async () => {
	const bus = new EventBus();
	const pool = new WorkerPool(bus, { browsers: { chrome: 2 } });
	const { spawner } = mockSpawner();
	await pool.spawn(spawner);
	assert.equal(pool.size, 2);
	pool.reset();
	assert.equal(pool.size, 0);
});

// -----------------------------------------------------------------------
// Executor error handling
// -----------------------------------------------------------------------

await test('executor throwing is caught and results in failure', async () => {
	const bus = new EventBus();
	const pool = new WorkerPool(bus, { browsers: { chrome: 1 } });
	const { spawner } = mockSpawner();
	await pool.spawn(spawner);

	const executor = async () => {
		throw new Error('executor crash');
	};
	const results = await pool.execute([makeItem('1')], executor);

	assert.equal(results.length, 1);
	assert.equal(results[0].status, 'failed');
	assert.equal(results[0].error.message, 'executor crash');
});

// -----------------------------------------------------------------------
// Worker busy/idle events
// -----------------------------------------------------------------------

await test('emits worker:busy and worker:idle during execution', async () => {
	const bus = new EventBus();
	bus.enableHistory();
	const pool = new WorkerPool(bus, { browsers: { chrome: 1 } });
	const { spawner } = mockSpawner();
	await pool.spawn(spawner);

	await pool.execute([makeItem('1')], mockExecutor());

	const busy = bus.getEventsOfType('worker:busy');
	const idle = bus.getEventsOfType('worker:idle');
	// worker:idle from spawn + after execution
	assert.ok(busy.length >= 1);
	assert.ok(idle.length >= 1);
});

// -----------------------------------------------------------------------
// Worker completedCount
// -----------------------------------------------------------------------

await test('completedCount tracks how many items a worker executed', async () => {
	const bus = new EventBus();
	const pool = new WorkerPool(bus, { browsers: { chrome: 1 } });
	const { spawner } = mockSpawner();
	await pool.spawn(spawner);

	await pool.execute([makeItem('1'), makeItem('2'), makeItem('3')], mockExecutor());

	const worker = pool.getWorkers()[0];
	assert.equal(worker.completedCount, 3);
});

// -----------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------

console.log(`\n  WorkerPool: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
