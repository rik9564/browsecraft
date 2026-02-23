#!/usr/bin/env node

// ============================================================================
// Unit Tests — TypeScript-Native BDD
// ============================================================================

import assert from 'node:assert/strict';
import {
	feature,
	scenario,
	given,
	when,
	thenStep,
	and,
	but,
	runFeatures,
	clearFeatures,
	getCollectedFeatureCount,
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

console.log('\n\x1b[1mTypeScript-Native BDD Tests\x1b[0m\n');

// -----------------------------------------------------------------------
// Collection
// -----------------------------------------------------------------------

test('feature() collects a feature', () => {
	clearFeatures();
	feature('Login', () => {
		scenario('Valid creds', () => {});
	});
	assert.equal(getCollectedFeatureCount(), 1);
	clearFeatures();
});

test('multiple features collected', () => {
	clearFeatures();
	feature('A', () => { scenario('S1', () => {}); });
	feature('B', () => { scenario('S2', () => {}); });
	assert.equal(getCollectedFeatureCount(), 2);
	clearFeatures();
});

test('clearFeatures resets count', () => {
	clearFeatures();
	feature('X', () => { scenario('Y', () => {}); });
	assert.equal(getCollectedFeatureCount(), 1);
	clearFeatures();
	assert.equal(getCollectedFeatureCount(), 0);
});

test('scenario outside feature throws', () => {
	clearFeatures();
	assert.throws(
		() => scenario('orphan', () => {}),
		/must be called inside a feature/,
	);
});

test('feature with tags', () => {
	clearFeatures();
	feature(['@smoke'], 'Tagged', () => {
		scenario('S', () => {});
	});
	assert.equal(getCollectedFeatureCount(), 1);
	clearFeatures();
});

test('scenario with tags', () => {
	clearFeatures();
	feature('F', () => {
		scenario(['@fast'], 'Tagged scenario', () => {});
	});
	assert.equal(getCollectedFeatureCount(), 1);
	clearFeatures();
});

// -----------------------------------------------------------------------
// runFeatures — execution
// -----------------------------------------------------------------------

await testAsync('runFeatures runs collected features', async () => {
	clearFeatures();
	const log = [];

	feature('Login', () => {
		scenario('Valid creds', (ctx) => {
			given('I am on the login page', () => { log.push('given'); });
			when('I submit', () => { log.push('when'); });
			thenStep('I see dashboard', () => { log.push('then'); });
		});
	});

	const result = await runFeatures({
		worldFactory: () => ({
			page: {},
			browser: {},
			ctx: {},
			attach: () => {},
			log: () => {},
		}),
	});

	assert.ok(result);
	assert.equal(result.features.length, 1);
	assert.equal(result.features[0].scenarios.length, 1);
	assert.equal(result.features[0].scenarios[0].status, 'passed');
	assert.deepEqual(log, ['given', 'when', 'then']);
	clearFeatures();
});

await testAsync('runFeatures handles step failure', async () => {
	clearFeatures();

	feature('Failing', () => {
		scenario('Bad step', (ctx) => {
			given('setup', () => {});
			when('something fails', () => { throw new Error('boom'); });
			thenStep('never reached', () => {});
		});
	});

	const result = await runFeatures({
		worldFactory: () => ({
			page: {},
			browser: {},
			ctx: {},
			attach: () => {},
			log: () => {},
		}),
	});

	assert.equal(result.features[0].scenarios[0].status, 'failed');
	// The "then" step should be skipped
	const steps = result.features[0].scenarios[0].steps;
	assert.equal(steps[0].status, 'passed');
	assert.equal(steps[1].status, 'failed');
	assert.equal(steps[2].status, 'skipped');
	clearFeatures();
});

await testAsync('runFeatures with no features returns empty result', async () => {
	clearFeatures();
	const result = await runFeatures();
	assert.equal(result.features.length, 0);
	clearFeatures();
});

await testAsync('runFeatures supports and/but steps', async () => {
	clearFeatures();
	const log = [];

	feature('Steps', () => {
		scenario('Various', (ctx) => {
			given('setup', () => { log.push('given'); });
			and('more setup', () => { log.push('and'); });
			when('action', () => { log.push('when'); });
			but('exception', () => { log.push('but'); });
			thenStep('verify', () => { log.push('then'); });
		});
	});

	const result = await runFeatures({
		worldFactory: () => ({
			page: {},
			browser: {},
			ctx: {},
			attach: () => {},
			log: () => {},
		}),
	});

	assert.equal(result.features[0].scenarios[0].status, 'passed');
	assert.deepEqual(log, ['given', 'and', 'when', 'but', 'then']);
	clearFeatures();
});

await testAsync('runFeatures with async steps', async () => {
	clearFeatures();

	feature('Async', () => {
		scenario('Async step', (ctx) => {
			given('async op', async () => {
				await new Promise(r => setTimeout(r, 5));
			});
		});
	});

	const result = await runFeatures({
		worldFactory: () => ({
			page: {},
			browser: {},
			ctx: {},
			attach: () => {},
			log: () => {},
		}),
	});

	assert.equal(result.features[0].scenarios[0].status, 'passed');
	clearFeatures();
});

// -----------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------

console.log(`\n  TS-BDD: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
