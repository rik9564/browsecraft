#!/usr/bin/env node

// ============================================================================
// Unit Tests — EventBus
// Exhaustive tests for the type-safe event system.
// ============================================================================

import assert from 'node:assert/strict';
import { EventBus } from '../../packages/browsecraft-runner/dist/index.js';

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

console.log('\n\x1b[1mEventBus Tests\x1b[0m\n');

// -----------------------------------------------------------------------
// Basic subscription + emission
// -----------------------------------------------------------------------

test('emits events to listeners', () => {
	const bus = new EventBus();
	let received = null;
	bus.on('run:start', (payload) => {
		received = payload;
	});
	bus.emit('run:start', { browsers: ['chrome'], totalItems: 5, workers: 2 });
	assert.deepStrictEqual(received, { browsers: ['chrome'], totalItems: 5, workers: 2 });
});

test('emits to multiple listeners', () => {
	const bus = new EventBus();
	const calls = [];
	bus.on('worker:spawn', () => calls.push('a'));
	bus.on('worker:spawn', () => calls.push('b'));
	bus.emit('worker:spawn', { id: 'chrome-0', browser: 'chrome', index: 0 });
	assert.deepStrictEqual(calls, ['a', 'b']);
});

test('different events are independent', () => {
	const bus = new EventBus();
	let spawnCalled = false;
	let readyCalled = false;
	bus.on('worker:spawn', () => {
		spawnCalled = true;
	});
	bus.on('worker:ready', () => {
		readyCalled = true;
	});
	bus.emit('worker:spawn', { id: 'x', browser: 'chrome', index: 0 });
	assert.equal(spawnCalled, true);
	assert.equal(readyCalled, false);
});

test('emitting event with no listeners does not throw', () => {
	const bus = new EventBus();
	assert.doesNotThrow(() => {
		bus.emit('run:start', { browsers: [], totalItems: 0, workers: 0 });
	});
});

// -----------------------------------------------------------------------
// Unsubscribe
// -----------------------------------------------------------------------

test('on() returns an unsubscribe function', () => {
	const bus = new EventBus();
	let count = 0;
	const unsub = bus.on('worker:idle', () => {
		count++;
	});
	bus.emit('worker:idle', { id: 'x', browser: 'chrome', index: 0 });
	assert.equal(count, 1);
	unsub();
	bus.emit('worker:idle', { id: 'x', browser: 'chrome', index: 0 });
	assert.equal(count, 1); // not called again
});

test('off() removes all listeners for an event', () => {
	const bus = new EventBus();
	let count = 0;
	bus.on('item:pass', () => {
		count++;
	});
	bus.on('item:pass', () => {
		count++;
	});
	bus.off('item:pass');
	bus.emit('item:pass', {
		item: { id: '1', title: 't', file: 'f', suitePath: [] },
		worker: { id: 'x', browser: 'chrome', index: 0 },
		status: 'passed',
		duration: 10,
	});
	assert.equal(count, 0);
});

test('off() with no args removes all listeners', () => {
	const bus = new EventBus();
	let count = 0;
	bus.on('item:pass', () => {
		count++;
	});
	bus.on('item:fail', () => {
		count++;
	});
	bus.off();
	bus.emit('item:pass', {
		item: { id: '1', title: 't', file: 'f', suitePath: [] },
		worker: { id: 'x', browser: 'chrome', index: 0 },
		status: 'passed',
		duration: 10,
	});
	bus.emit('item:fail', {
		item: { id: '1', title: 't', file: 'f', suitePath: [] },
		worker: { id: 'x', browser: 'chrome', index: 0 },
		status: 'failed',
		duration: 10,
	});
	assert.equal(count, 0);
});

// -----------------------------------------------------------------------
// once()
// -----------------------------------------------------------------------

test('once() fires only once', () => {
	const bus = new EventBus();
	let count = 0;
	bus.once('worker:spawn', () => {
		count++;
	});
	bus.emit('worker:spawn', { id: 'x', browser: 'chrome', index: 0 });
	bus.emit('worker:spawn', { id: 'x', browser: 'chrome', index: 0 });
	bus.emit('worker:spawn', { id: 'x', browser: 'chrome', index: 0 });
	assert.equal(count, 1);
});

test('once() returns an unsubscribe that works before firing', () => {
	const bus = new EventBus();
	let count = 0;
	const unsub = bus.once('worker:spawn', () => {
		count++;
	});
	unsub();
	bus.emit('worker:spawn', { id: 'x', browser: 'chrome', index: 0 });
	assert.equal(count, 0);
});

// -----------------------------------------------------------------------
// Listener error isolation
// -----------------------------------------------------------------------

test('listener errors do not break other listeners', () => {
	const bus = new EventBus();
	let secondCalled = false;
	bus.on('worker:spawn', () => {
		throw new Error('boom');
	});
	bus.on('worker:spawn', () => {
		secondCalled = true;
	});
	bus.emit('worker:spawn', { id: 'x', browser: 'chrome', index: 0 });
	assert.equal(secondCalled, true);
});

// -----------------------------------------------------------------------
// Introspection
// -----------------------------------------------------------------------

test('listenerCount for specific event', () => {
	const bus = new EventBus();
	assert.equal(bus.listenerCount('worker:spawn'), 0);
	bus.on('worker:spawn', () => {});
	assert.equal(bus.listenerCount('worker:spawn'), 1);
	bus.on('worker:spawn', () => {});
	assert.equal(bus.listenerCount('worker:spawn'), 2);
});

test('listenerCount for all events', () => {
	const bus = new EventBus();
	bus.on('worker:spawn', () => {});
	bus.on('item:pass', () => {});
	bus.on('item:fail', () => {});
	assert.equal(bus.listenerCount(), 3);
});

test('eventNames returns active event names', () => {
	const bus = new EventBus();
	bus.on('worker:spawn', () => {});
	bus.on('item:pass', () => {});
	const names = bus.eventNames().sort();
	assert.deepStrictEqual(names, ['item:pass', 'worker:spawn']);
});

// -----------------------------------------------------------------------
// History
// -----------------------------------------------------------------------

test('history is not recorded by default', () => {
	const bus = new EventBus();
	bus.emit('worker:spawn', { id: 'x', browser: 'chrome', index: 0 });
	assert.equal(bus.getHistory().length, 0);
});

test('enableHistory records events', () => {
	const bus = new EventBus();
	bus.enableHistory();
	bus.emit('worker:spawn', { id: 'x', browser: 'chrome', index: 0 });
	bus.emit('worker:ready', { id: 'x', browser: 'chrome', index: 0 });
	assert.equal(bus.getHistory().length, 2);
	assert.equal(bus.getHistory()[0].event, 'worker:spawn');
	assert.equal(bus.getHistory()[1].event, 'worker:ready');
});

test('getEventsOfType filters by event name', () => {
	const bus = new EventBus();
	bus.enableHistory();
	bus.emit('worker:spawn', { id: 'a', browser: 'chrome', index: 0 });
	bus.emit('worker:ready', { id: 'a', browser: 'chrome', index: 0 });
	bus.emit('worker:spawn', { id: 'b', browser: 'firefox', index: 0 });

	const spawns = bus.getEventsOfType('worker:spawn');
	assert.equal(spawns.length, 2);
	assert.equal(spawns[0].payload.id, 'a');
	assert.equal(spawns[1].payload.id, 'b');
});

test('clearHistory clears without disabling', () => {
	const bus = new EventBus();
	bus.enableHistory();
	bus.emit('worker:spawn', { id: 'x', browser: 'chrome', index: 0 });
	assert.equal(bus.getHistory().length, 1);
	bus.clearHistory();
	assert.equal(bus.getHistory().length, 0);
	// Still recording
	bus.emit('worker:spawn', { id: 'x', browser: 'chrome', index: 0 });
	assert.equal(bus.getHistory().length, 1);
});

test('disableHistory stops recording and clears', () => {
	const bus = new EventBus();
	bus.enableHistory();
	bus.emit('worker:spawn', { id: 'x', browser: 'chrome', index: 0 });
	bus.disableHistory();
	assert.equal(bus.getHistory().length, 0);
	bus.emit('worker:spawn', { id: 'x', browser: 'chrome', index: 0 });
	assert.equal(bus.getHistory().length, 0);
});

test('history events have timestamps', () => {
	const bus = new EventBus();
	bus.enableHistory();
	const before = Date.now();
	bus.emit('worker:spawn', { id: 'x', browser: 'chrome', index: 0 });
	const after = Date.now();
	const ts = bus.getHistory()[0].timestamp;
	assert.ok(ts >= before && ts <= after);
});

// -----------------------------------------------------------------------
// Progress event
// -----------------------------------------------------------------------

test('progress event carries completion data', () => {
	const bus = new EventBus();
	let data = null;
	bus.on('progress', (p) => {
		data = p;
	});
	bus.emit('progress', { completed: 3, total: 10, passed: 2, failed: 1, skipped: 0, elapsed: 500 });
	assert.equal(data.completed, 3);
	assert.equal(data.total, 10);
	assert.equal(data.elapsed, 500);
});

// -----------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------

console.log(`\n  EventBus: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
