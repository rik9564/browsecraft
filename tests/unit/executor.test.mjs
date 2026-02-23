#!/usr/bin/env node

// ============================================================================
// Unit Tests — BDD Executor (computeSummary, pending, BddExecutor, createExecutor)
// ============================================================================

import assert from 'node:assert/strict';
import {
	BddExecutor,
	HookRegistry,
	StepRegistry,
	computeSummary,
	createExecutor,
	parseGherkin,
	pending,
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

console.log('\n\x1b[1mExecutor Tests\x1b[0m\n');

// -----------------------------------------------------------------------
// computeSummary
// -----------------------------------------------------------------------

test('computeSummary with all passed', () => {
	const features = [
		{
			name: 'Feature A',
			status: 'passed',
			scenarios: [
				{ name: 'S1', status: 'passed', steps: [], duration: 100, tags: [] },
				{ name: 'S2', status: 'passed', steps: [], duration: 200, tags: [] },
			],
			tags: [],
			duration: 300,
		},
	];
	const summary = computeSummary(features);
	assert.equal(summary.scenarios.total, 2);
	assert.equal(summary.scenarios.passed, 2);
	assert.equal(summary.scenarios.failed, 0);
	assert.equal(summary.scenarios.skipped, 0);
	assert.equal(summary.scenarios.pending, 0);
	assert.equal(summary.features.total, 1);
	assert.equal(summary.features.passed, 1);
});

test('computeSummary with mixed statuses', () => {
	const features = [
		{
			name: 'Feature A',
			status: 'failed',
			scenarios: [
				{ name: 'S1', status: 'passed', steps: [], duration: 100, tags: [] },
				{ name: 'S2', status: 'failed', steps: [], duration: 200, tags: [] },
				{ name: 'S3', status: 'skipped', steps: [], duration: 0, tags: [] },
				{ name: 'S4', status: 'pending', steps: [], duration: 0, tags: [] },
			],
			tags: [],
			duration: 300,
		},
	];
	const summary = computeSummary(features);
	assert.equal(summary.scenarios.total, 4);
	assert.equal(summary.scenarios.passed, 1);
	assert.equal(summary.scenarios.failed, 1);
	assert.equal(summary.scenarios.skipped, 1);
	assert.equal(summary.scenarios.pending, 1);
});

test('computeSummary with empty features', () => {
	const summary = computeSummary([]);
	assert.equal(summary.scenarios.total, 0);
	assert.equal(summary.scenarios.passed, 0);
	assert.equal(summary.scenarios.failed, 0);
	assert.equal(summary.features.total, 0);
});

test('computeSummary with multiple features', () => {
	const features = [
		{
			name: 'F1',
			status: 'passed',
			scenarios: [{ name: 'S1', status: 'passed', steps: [], duration: 100, tags: [] }],
			tags: [],
			duration: 100,
		},
		{
			name: 'F2',
			status: 'passed',
			scenarios: [{ name: 'S2', status: 'passed', steps: [], duration: 200, tags: [] }],
			tags: [],
			duration: 200,
		},
	];
	const summary = computeSummary(features);
	assert.equal(summary.scenarios.total, 2);
	assert.equal(summary.scenarios.passed, 2);
	assert.equal(summary.features.total, 2);
});

// -----------------------------------------------------------------------
// pending()
// -----------------------------------------------------------------------

test('pending() throws with PENDING message', () => {
	assert.throws(
		() => pending(),
		(err) => err.message === 'PENDING',
	);
});

test('pending() throws an Error instance', () => {
	try {
		pending();
		assert.fail('should have thrown');
	} catch (err) {
		assert.ok(err instanceof Error);
		assert.equal(err.message, 'PENDING');
	}
});

// -----------------------------------------------------------------------
// createExecutor
// -----------------------------------------------------------------------

test('createExecutor returns a BddExecutor instance', () => {
	const executor = createExecutor();
	assert.ok(executor instanceof BddExecutor);
});

test('createExecutor accepts options', () => {
	const executor = createExecutor({ stepTimeout: 5000, failFast: true });
	assert.ok(executor instanceof BddExecutor);
});

// -----------------------------------------------------------------------
// computeSummary — step-level counting
// -----------------------------------------------------------------------

test('computeSummary counts step statuses', () => {
	const features = [
		{
			name: 'F1',
			status: 'failed',
			scenarios: [
				{
					name: 'S1',
					status: 'failed',
					duration: 100,
					tags: [],
					steps: [
						{ text: 'step 1', keyword: 'Given', status: 'passed', duration: 10 },
						{ text: 'step 2', keyword: 'When', status: 'failed', duration: 20 },
						{ text: 'step 3', keyword: 'Then', status: 'skipped', duration: 0 },
					],
				},
			],
			tags: [],
			duration: 100,
		},
	];
	const summary = computeSummary(features);
	assert.equal(summary.steps.total, 3);
	assert.equal(summary.steps.passed, 1);
	assert.equal(summary.steps.failed, 1);
	assert.equal(summary.steps.skipped, 1);
});

test('computeSummary counts undefined and pending steps', () => {
	const features = [
		{
			name: 'F1',
			status: 'failed',
			scenarios: [
				{
					name: 'S1',
					status: 'pending',
					duration: 100,
					tags: [],
					steps: [
						{ text: 'step 1', keyword: 'Given', status: 'undefined', duration: 0 },
						{ text: 'step 2', keyword: 'When', status: 'pending', duration: 10 },
					],
				},
			],
			tags: [],
			duration: 100,
		},
	];
	const summary = computeSummary(features);
	assert.equal(summary.steps.undefined, 1);
	assert.equal(summary.steps.pending, 1);
	assert.equal(summary.steps.total, 2);
});

// -----------------------------------------------------------------------
// BddExecutor — runDocument integration tests
// -----------------------------------------------------------------------

/** Minimal feature for testing */
function minimalFeature(scenarioBody = 'Given a test step') {
	return `Feature: Test Feature
  Scenario: Test Scenario
    ${scenarioBody}`;
}

/** Create an executor with a fresh registry and matching step definitions */
function setupExecutor(steps = {}, options = {}) {
	const registry = new StepRegistry();
	const hooks = new HookRegistry();

	for (const [pattern, fn] of Object.entries(steps)) {
		// Determine type from pattern prefix
		let type = 'Any';
		let cleanPattern = pattern;
		if (pattern.startsWith('Given ')) {
			type = 'Given';
			cleanPattern = pattern.slice(6);
		} else if (pattern.startsWith('When ')) {
			type = 'When';
			cleanPattern = pattern.slice(5);
		} else if (pattern.startsWith('Then ')) {
			type = 'Then';
			cleanPattern = pattern.slice(5);
		}
		registry.register(type, cleanPattern, fn);
	}

	const executor = new BddExecutor({
		registry,
		hooks,
		stepTimeout: 2000,
		...options,
	});

	return { executor, registry, hooks };
}

await testAsync('BddExecutor runs a simple passing scenario', async () => {
	let stepRan = false;
	const { executor } = setupExecutor({
		'Given a test step': (world) => {
			stepRan = true;
		},
	});

	const doc = parseGherkin(minimalFeature());
	const result = await executor.runDocument(doc);

	assert.ok(stepRan, 'Step should have been executed');
	assert.equal(result.features.length, 1);
	assert.equal(result.features[0].status, 'passed');
	assert.equal(result.features[0].scenarios.length, 1);
	assert.equal(result.features[0].scenarios[0].status, 'passed');
	assert.equal(result.features[0].scenarios[0].steps.length, 1);
	assert.equal(result.features[0].scenarios[0].steps[0].status, 'passed');
});

await testAsync('BddExecutor reports undefined steps', async () => {
	const { executor } = setupExecutor({}); // No step definitions

	const doc = parseGherkin(minimalFeature());
	const result = await executor.runDocument(doc);

	assert.equal(result.features[0].scenarios[0].steps[0].status, 'undefined');
	assert.ok(result.features[0].scenarios[0].steps[0].error);
	assert.ok(result.features[0].scenarios[0].steps[0].error.message.includes('Undefined step'));
});

await testAsync('BddExecutor reports failed steps', async () => {
	const { executor } = setupExecutor({
		'Given a test step': () => {
			throw new Error('Step deliberate failure');
		},
	});

	const doc = parseGherkin(minimalFeature());
	const result = await executor.runDocument(doc);

	assert.equal(result.features[0].status, 'failed');
	assert.equal(result.features[0].scenarios[0].status, 'failed');
	assert.equal(result.features[0].scenarios[0].steps[0].status, 'failed');
	assert.ok(result.features[0].scenarios[0].steps[0].error.message.includes('deliberate failure'));
});

await testAsync('BddExecutor handles pending steps', async () => {
	const { executor } = setupExecutor({
		'Given a test step': () => {
			throw new Error('PENDING');
		},
	});

	const doc = parseGherkin(minimalFeature());
	const result = await executor.runDocument(doc);

	assert.equal(result.features[0].scenarios[0].steps[0].status, 'pending');
});

await testAsync('BddExecutor runs multiple scenarios', async () => {
	const calls = [];
	const { executor } = setupExecutor({
		'Given scenario {word}': (world, name) => {
			calls.push(name);
		},
	});

	const feature = `Feature: Multi
  Scenario: First
    Given scenario alpha
  Scenario: Second
    Given scenario beta`;

	const doc = parseGherkin(feature);
	const result = await executor.runDocument(doc);

	assert.deepEqual(calls, ['alpha', 'beta']);
	assert.equal(result.features[0].scenarios.length, 2);
	assert.equal(result.features[0].scenarios[0].status, 'passed');
	assert.equal(result.features[0].scenarios[1].status, 'passed');
});

await testAsync('BddExecutor runs multiple steps in order', async () => {
	const order = [];
	const { executor } = setupExecutor({
		'Given step one': () => order.push('given'),
		'When step two': () => order.push('when'),
		'Then step three': () => order.push('then'),
	});

	const feature = `Feature: Order
  Scenario: Steps
    Given step one
    When step two
    Then step three`;

	const doc = parseGherkin(feature);
	const result = await executor.runDocument(doc);

	assert.deepEqual(order, ['given', 'when', 'then']);
	assert.equal(result.features[0].scenarios[0].status, 'passed');
	assert.equal(result.features[0].scenarios[0].steps.length, 3);
});

await testAsync('BddExecutor skips steps after failure', async () => {
	const order = [];
	const { executor } = setupExecutor({
		'Given step one': () => {
			order.push('given');
			throw new Error('fail!');
		},
		'When step two': () => order.push('when'),
		'Then step three': () => order.push('then'),
	});

	const feature = `Feature: Skip
  Scenario: Failing
    Given step one
    When step two
    Then step three`;

	const doc = parseGherkin(feature);
	const result = await executor.runDocument(doc);

	assert.deepEqual(order, ['given']); // Only first step ran
	assert.equal(result.features[0].scenarios[0].steps[0].status, 'failed');
	assert.equal(result.features[0].scenarios[0].steps[1].status, 'skipped');
	assert.equal(result.features[0].scenarios[0].steps[2].status, 'skipped');
});

await testAsync('BddExecutor handles Scenario Outline with Examples', async () => {
	const calls = [];
	const { executor } = setupExecutor({
		'Given I have {int} items': (world, count) => {
			calls.push(Number(count));
		},
	});

	const feature = `Feature: Outline
  Scenario Outline: Items
    Given I have <count> items

    Examples:
      | count |
      | 3     |
      | 5     |
      | 10    |`;

	const doc = parseGherkin(feature);
	const result = await executor.runDocument(doc);

	assert.deepEqual(calls, [3, 5, 10]);
	// Scenario Outline expands into 3 scenarios
	assert.equal(result.features[0].scenarios.length, 3);
	for (const s of result.features[0].scenarios) {
		assert.equal(s.status, 'passed');
	}
});

await testAsync('BddExecutor passes parameters from step patterns', async () => {
	let captured = {};
	const { executor } = setupExecutor({
		'Given user {string} with age {int}': (world, name, age) => {
			captured = { name, age: Number(age) };
		},
	});

	const feature = `Feature: Params
  Scenario: Capture
    Given user "Alice" with age 30`;

	const doc = parseGherkin(feature);
	await executor.runDocument(doc);

	assert.equal(captured.name, 'Alice');
	assert.equal(captured.age, 30);
});

await testAsync('BddExecutor runs Background steps before each scenario', async () => {
	const order = [];
	const { executor } = setupExecutor({
		'Given background step': () => order.push('bg'),
		'Given scenario A': () => order.push('A'),
		'Given scenario B': () => order.push('B'),
	});

	const feature = `Feature: Background
  Background:
    Given background step

  Scenario: First
    Given scenario A

  Scenario: Second
    Given scenario B`;

	const doc = parseGherkin(feature);
	const result = await executor.runDocument(doc);

	assert.deepEqual(order, ['bg', 'A', 'bg', 'B']);
	assert.equal(result.features[0].scenarios.length, 2);
});

await testAsync('BddExecutor step timeout triggers failure', async () => {
	const { executor } = setupExecutor(
		{
			'Given a slow step': async () => {
				await new Promise((r) => setTimeout(r, 5000));
			},
		},
		{ stepTimeout: 200 },
	);

	const doc = parseGherkin(minimalFeature('Given a slow step'));
	const result = await executor.runDocument(doc);

	assert.equal(result.features[0].scenarios[0].steps[0].status, 'failed');
	assert.ok(result.features[0].scenarios[0].steps[0].error.message.includes('timed out'));
});

await testAsync('BddExecutor world is passed to step functions', async () => {
	let receivedWorld = null;
	const { executor } = setupExecutor({
		'Given a test step': (world) => {
			receivedWorld = world;
		},
	});

	const doc = parseGherkin(minimalFeature());
	await executor.runDocument(doc);

	assert.ok(receivedWorld !== null, 'World should be passed to step');
	assert.ok(typeof receivedWorld === 'object', 'World should be an object');
});

await testAsync('BddExecutor records duration for steps', async () => {
	const { executor } = setupExecutor({
		'Given a test step': async () => {
			await new Promise((r) => setTimeout(r, 50));
		},
	});

	const doc = parseGherkin(minimalFeature());
	const result = await executor.runDocument(doc);

	const stepDuration = result.features[0].scenarios[0].steps[0].duration;
	assert.ok(stepDuration >= 40, `Step duration ${stepDuration}ms, expected >= 40`);
});

await testAsync('BddExecutor records duration for scenarios', async () => {
	const { executor } = setupExecutor({
		'Given a test step': async () => {
			await new Promise((r) => setTimeout(r, 50));
		},
	});

	const doc = parseGherkin(minimalFeature());
	const result = await executor.runDocument(doc);

	const scenarioDuration = result.features[0].scenarios[0].duration;
	assert.ok(scenarioDuration >= 40, `Scenario duration ${scenarioDuration}ms, expected >= 40`);
});

await testAsync('BddExecutor runs hooks in correct order', async () => {
	const order = [];
	const registry = new StepRegistry();
	const hooks = new HookRegistry();

	registry.register('Given', 'a test step', () => order.push('step'));

	hooks.register('beforeScenario', async () => order.push('before'));
	hooks.register('afterScenario', async () => order.push('after'));

	const executor = new BddExecutor({ registry, hooks, stepTimeout: 2000 });

	const doc = parseGherkin(minimalFeature());
	await executor.runDocument(doc);

	assert.deepEqual(order, ['before', 'step', 'after']);
});

await testAsync('BddExecutor afterScenario hooks run even on failure', async () => {
	const order = [];
	const registry = new StepRegistry();
	const hooks = new HookRegistry();

	registry.register('Given', 'a test step', () => {
		order.push('step');
		throw new Error('fail');
	});

	hooks.register('afterScenario', async () => order.push('after'));

	const executor = new BddExecutor({ registry, hooks, stepTimeout: 2000 });

	const doc = parseGherkin(minimalFeature());
	await executor.runDocument(doc);

	assert.ok(order.includes('after'), 'afterScenario hook should run even on failure');
});

await testAsync('BddExecutor onScenarioEnd callback fires', async () => {
	let callbackResult = null;
	const { executor } = setupExecutor(
		{ 'Given a test step': () => {} },
		{
			onScenarioEnd: (result) => {
				callbackResult = result;
			},
		},
	);

	const doc = parseGherkin(minimalFeature());
	await executor.runDocument(doc);

	assert.ok(callbackResult, 'onScenarioEnd should have been called');
	assert.equal(callbackResult.status, 'passed');
	assert.equal(callbackResult.name, 'Test Scenario');
});

await testAsync('BddExecutor handles And/But keyword conjunction', async () => {
	const order = [];
	const { executor } = setupExecutor({
		'Given step one': () => order.push('given'),
		'Given step two': () => order.push('and-given'),
		'When action': () => order.push('when'),
		'Then result': () => order.push('then'),
		'Then extra': () => order.push('but-then'),
	});

	const feature = `Feature: Conjunctions
  Scenario: Steps
    Given step one
    And step two
    When action
    Then result
    But extra`;

	const doc = parseGherkin(feature);
	const result = await executor.runDocument(doc);

	assert.deepEqual(order, ['given', 'and-given', 'when', 'then', 'but-then']);
	assert.equal(result.features[0].scenarios[0].status, 'passed');
});

await testAsync('BddExecutor summary is accurate', async () => {
	const { executor } = setupExecutor({
		'Given a test step': () => {},
	});

	const feature = `Feature: Summary
  Scenario: S1
    Given a test step
  Scenario: S2
    Given a test step`;

	const doc = parseGherkin(feature);
	const result = await executor.runDocument(doc);

	assert.equal(result.summary.features.total, 1);
	assert.equal(result.summary.features.passed, 1);
	assert.equal(result.summary.scenarios.total, 2);
	assert.equal(result.summary.scenarios.passed, 2);
	assert.equal(result.summary.steps.total, 2);
	assert.equal(result.summary.steps.passed, 2);
});

// -----------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------

console.log(`\n  Executor: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
