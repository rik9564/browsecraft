#!/usr/bin/env node

// ============================================================================
// Unit Tests — Hook Registry
// ============================================================================

import assert from 'node:assert/strict';
import {
	After,
	AfterAll,
	AfterFeature,
	AfterStep,
	Before,
	BeforeAll,
	BeforeFeature,
	BeforeStep,
	HookRegistry,
	globalHookRegistry,
} from '../../packages/browsecraft-bdd/dist/index.js';

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

console.log('\n\x1b[1mHook Registry Tests\x1b[0m\n');

// -----------------------------------------------------------------------
// Registration & retrieval
// -----------------------------------------------------------------------

test('register and getHooks for beforeScenario', () => {
	const reg = new HookRegistry();
	const fn = () => {};
	reg.register('beforeScenario', fn);
	const hooks = reg.getHooks('beforeScenario');
	assert.equal(hooks.length, 1);
	assert.equal(hooks[0].fn, fn);
	assert.equal(hooks[0].scope, 'beforeScenario');
});

test('register multiple hooks for same scope', () => {
	const reg = new HookRegistry();
	reg.register('afterScenario', () => {});
	reg.register('afterScenario', () => {});
	assert.equal(reg.getHooks('afterScenario').length, 2);
});

test('getHooks returns empty array for unregistered scope', () => {
	const reg = new HookRegistry();
	assert.equal(reg.getHooks('beforeStep').length, 0);
});

test('register with tag filter', () => {
	const reg = new HookRegistry();
	reg.register('beforeScenario', '@smoke', () => {});
	// With matching tags
	const matched = reg.getHooks('beforeScenario', ['@smoke']);
	assert.equal(matched.length, 1);
	// Without matching tags
	const unmatched = reg.getHooks('beforeScenario', ['@regression']);
	assert.equal(unmatched.length, 0);
});

test('tag filter with no tags returns no hooks', () => {
	const reg = new HookRegistry();
	reg.register('beforeScenario', '@smoke', () => {});
	assert.equal(reg.getHooks('beforeScenario', []).length, 0);
	assert.equal(reg.getHooks('beforeScenario').length, 0);
});

test('hook without tag filter matches all tags', () => {
	const reg = new HookRegistry();
	reg.register('beforeScenario', () => {});
	assert.equal(reg.getHooks('beforeScenario', ['@anything']).length, 1);
	assert.equal(reg.getHooks('beforeScenario', []).length, 1);
	assert.equal(reg.getHooks('beforeScenario').length, 1);
});

test('throws when tag filter has no function', () => {
	const reg = new HookRegistry();
	assert.throws(() => reg.register('beforeScenario', '@smoke'), /no function provided/);
});

// -----------------------------------------------------------------------
// Priority ordering
// -----------------------------------------------------------------------

test('hooks run in priority order (lower first)', () => {
	const reg = new HookRegistry();
	reg.register('beforeScenario', () => {}, undefined, { priority: 500 });
	reg.register('beforeScenario', () => {}, undefined, { priority: 100 });
	reg.register('beforeScenario', () => {}, undefined, { priority: 1000 });
	const hooks = reg.getHooks('beforeScenario');
	assert.equal(hooks[0].priority, 100);
	assert.equal(hooks[1].priority, 500);
	assert.equal(hooks[2].priority, 1000);
});

test('default priority is 1000', () => {
	const reg = new HookRegistry();
	reg.register('beforeScenario', () => {});
	assert.equal(reg.getHooks('beforeScenario')[0].priority, 1000);
});

// -----------------------------------------------------------------------
// Timeout
// -----------------------------------------------------------------------

test('default timeout is 30000', () => {
	const reg = new HookRegistry();
	reg.register('beforeScenario', () => {});
	assert.equal(reg.getHooks('beforeScenario')[0].timeout, 30000);
});

test('custom timeout', () => {
	const reg = new HookRegistry();
	reg.register('beforeScenario', () => {}, undefined, { timeout: 5000 });
	assert.equal(reg.getHooks('beforeScenario')[0].timeout, 5000);
});

// -----------------------------------------------------------------------
// runHooks
// -----------------------------------------------------------------------

await testAsync('runHooks executes all matching hooks', async () => {
	const reg = new HookRegistry();
	const order = [];
	reg.register('beforeScenario', () => order.push('a'), undefined, { priority: 200 });
	reg.register('beforeScenario', () => order.push('b'), undefined, { priority: 100 });
	await reg.runHooks('beforeScenario', { scenarioTags: ['@smoke'] });
	assert.deepEqual(order, ['b', 'a']); // lower priority first
});

await testAsync('runHooks passes context to hooks', async () => {
	const reg = new HookRegistry();
	let receivedCtx = null;
	reg.register('beforeScenario', (ctx) => {
		receivedCtx = ctx;
	});
	const ctx = { scenarioName: 'test', scenarioTags: ['@smoke'] };
	await reg.runHooks('beforeScenario', ctx);
	assert.equal(receivedCtx.scenarioName, 'test');
});

await testAsync('runHooks handles async hooks', async () => {
	const reg = new HookRegistry();
	let executed = false;
	reg.register('beforeScenario', async () => {
		await new Promise((r) => setTimeout(r, 10));
		executed = true;
	});
	await reg.runHooks('beforeScenario', {});
	assert.equal(executed, true);
});

await testAsync('runHooks skips hooks with non-matching tags', async () => {
	const reg = new HookRegistry();
	let executed = false;
	reg.register('beforeScenario', '@admin', () => {
		executed = true;
	});
	await reg.runHooks('beforeScenario', { scenarioTags: ['@user'] });
	assert.equal(executed, false);
});

// -----------------------------------------------------------------------
// Clear
// -----------------------------------------------------------------------

test('clear removes all hooks', () => {
	const reg = new HookRegistry();
	reg.register('beforeScenario', () => {});
	reg.register('afterScenario', () => {});
	reg.clear();
	assert.equal(reg.getAll().length, 0);
});

// -----------------------------------------------------------------------
// getAll
// -----------------------------------------------------------------------

test('getAll returns all hooks', () => {
	const reg = new HookRegistry();
	reg.register('beforeScenario', () => {});
	reg.register('afterScenario', () => {});
	reg.register('beforeStep', () => {});
	assert.equal(reg.getAll().length, 3);
});

// -----------------------------------------------------------------------
// Convenience functions registration (global registry)
// -----------------------------------------------------------------------

test('Before registers on global hook registry', () => {
	globalHookRegistry.clear();
	Before(() => {});
	const hooks = globalHookRegistry.getHooks('beforeScenario');
	assert.equal(hooks.length, 1);
	globalHookRegistry.clear();
});

test('After registers on global hook registry', () => {
	globalHookRegistry.clear();
	After(() => {});
	const hooks = globalHookRegistry.getHooks('afterScenario');
	assert.equal(hooks.length, 1);
	globalHookRegistry.clear();
});

test('BeforeAll registers on global hook registry', () => {
	globalHookRegistry.clear();
	BeforeAll(() => {});
	assert.equal(globalHookRegistry.getHooks('beforeAll').length, 1);
	globalHookRegistry.clear();
});

test('AfterAll registers on global hook registry', () => {
	globalHookRegistry.clear();
	AfterAll(() => {});
	assert.equal(globalHookRegistry.getHooks('afterAll').length, 1);
	globalHookRegistry.clear();
});

test('BeforeFeature registers on global hook registry', () => {
	globalHookRegistry.clear();
	BeforeFeature(() => {});
	assert.equal(globalHookRegistry.getHooks('beforeFeature').length, 1);
	globalHookRegistry.clear();
});

test('AfterFeature registers on global hook registry', () => {
	globalHookRegistry.clear();
	AfterFeature(() => {});
	assert.equal(globalHookRegistry.getHooks('afterFeature').length, 1);
	globalHookRegistry.clear();
});

test('BeforeStep registers on global hook registry', () => {
	globalHookRegistry.clear();
	BeforeStep(() => {});
	assert.equal(globalHookRegistry.getHooks('beforeStep').length, 1);
	globalHookRegistry.clear();
});

test('AfterStep registers on global hook registry', () => {
	globalHookRegistry.clear();
	AfterStep(() => {});
	assert.equal(globalHookRegistry.getHooks('afterStep').length, 1);
	globalHookRegistry.clear();
});

test('Before with tag filter', () => {
	globalHookRegistry.clear();
	Before('@login', () => {});
	const hooks = globalHookRegistry.getHooks('beforeScenario', ['@login']);
	assert.equal(hooks.length, 1);
	const noMatch = globalHookRegistry.getHooks('beforeScenario', ['@other']);
	assert.equal(noMatch.length, 0);
	globalHookRegistry.clear();
});

// -----------------------------------------------------------------------
// All scopes
// -----------------------------------------------------------------------

test('all 8 hook scopes work', () => {
	const reg = new HookRegistry();
	const scopes = [
		'beforeAll',
		'afterAll',
		'beforeFeature',
		'afterFeature',
		'beforeScenario',
		'afterScenario',
		'beforeStep',
		'afterStep',
	];
	for (const scope of scopes) {
		reg.register(scope, () => {});
	}
	assert.equal(reg.getAll().length, 8);
	for (const scope of scopes) {
		assert.equal(reg.getHooks(scope).length, 1, `Expected 1 hook for ${scope}`);
	}
});

// -----------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------

console.log(`\n  Hooks: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
