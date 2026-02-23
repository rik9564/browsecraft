#!/usr/bin/env node

// ============================================================================
// Unit Tests — AI Step Executor + Executor stability fixes
//
// Tests:
//   - AIStepExecutor construction, config, cache, disabled mode
//   - BddExecutor integration with aiStepExecutor option
//   - worldFactory crash handling (graceful failure)
//   - Step timeout leak fix (clearTimeout on completion)
// ============================================================================

import assert from 'node:assert/strict';
import {
	AIStepExecutor,
	BddExecutor,
	StepRegistry,
	createAIStepExecutor,
	createAIStepExecutorFromConfig,
	parseGherkin,
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

console.log('\n\x1b[1mAI Step Executor Tests\x1b[0m\n');

// =========================================================================
// AIStepExecutor — Construction
// =========================================================================

console.log('  \x1b[2mConstruction\x1b[0m');

test('createAIStepExecutor returns AIStepExecutor instance', () => {
	const executor = createAIStepExecutor();
	assert.ok(executor instanceof AIStepExecutor);
});

test('new AIStepExecutor() works with empty config', () => {
	const executor = new AIStepExecutor({});
	assert.ok(executor instanceof AIStepExecutor);
});

test('createAIStepExecutor accepts full config', () => {
	const executor = createAIStepExecutor({
		model: 'openai/gpt-4o',
		cacheSize: 100,
		aiTimeout: 5000,
		actionTimeout: 10000,
		enabled: true,
		debug: false,
		appContext: 'E-commerce app at https://shop.example.com',
	});
	assert.ok(executor instanceof AIStepExecutor);
});

// =========================================================================
// AIStepExecutor — Cache
// =========================================================================

console.log('\n  \x1b[2mCache management\x1b[0m');

test('cache starts empty', () => {
	const executor = createAIStepExecutor();
	assert.equal(executor.cacheSize, 0);
});

test('clearCache resets to zero', () => {
	const executor = createAIStepExecutor();
	executor.clearCache();
	assert.equal(executor.cacheSize, 0);
});

// =========================================================================
// AIStepExecutor — Disabled mode
// =========================================================================

console.log('\n  \x1b[2mDisabled mode\x1b[0m');

await testAsync('returns handled=false when disabled', async () => {
	const executor = createAIStepExecutor({ enabled: false });
	const result = await executor.executeStep('I click "Submit"', 'When', {});

	assert.equal(result.handled, false);
	assert.equal(result.plan, null);
	assert.equal(result.aiTime, 0);
	assert.equal(result.execTime, 0);
});

await testAsync('returns passed=false when disabled', async () => {
	const executor = createAIStepExecutor({ enabled: false });
	const result = await executor.executeStep('I should see "Hello"', 'Then', {});

	assert.equal(result.passed, false);
	assert.equal(result.cached, false);
});

// =========================================================================
// AIStepExecutor — AI unavailable (no token)
// =========================================================================

console.log('\n  \x1b[2mAI unavailable\x1b[0m');

await testAsync('returns handled=false when AI is unavailable', async () => {
	const executor = createAIStepExecutor({ token: '' });
	const result = await executor.executeStep('I click "Submit"', 'When', {});

	assert.equal(result.handled, false);
	assert.ok(result.error);
	assert.ok(
		result.error.message.includes('unavailable') ||
		result.error.message.includes('GITHUB_TOKEN') ||
		result.error.message.includes('env var'),
	);
});

await testAsync('isAvailable returns false without token', async () => {
	const executor = createAIStepExecutor({ token: '' });
	const available = await executor.isAvailable();
	assert.equal(available, false);
});

// =========================================================================
// Multi-provider support
// =========================================================================

console.log('\n  \x1b[2mMulti-provider support\x1b[0m');

test('createAIStepExecutor with provider config', () => {
	const executor = createAIStepExecutor({
		provider: { provider: 'openai', token: 'sk-test', model: 'gpt-4o' },
	});
	assert.ok(executor instanceof AIStepExecutor);
	assert.equal(executor.provider, 'openai');
});

test('default provider is github-models', () => {
	const executor = createAIStepExecutor();
	assert.equal(executor.provider, 'github-models');
});

test('legacy token config still works', () => {
	const executor = createAIStepExecutor({ token: 'ghp_test123' });
	assert.equal(executor.provider, 'github-models');
});

test('provider config for each supported provider', () => {
	for (const provider of ['github-models', 'openai', 'anthropic', 'ollama']) {
		const executor = createAIStepExecutor({
			provider: { provider },
		});
		assert.equal(executor.provider, provider);
	}
});

// =========================================================================
// createAIStepExecutorFromConfig (user-facing config)
// =========================================================================

console.log('\n  \x1b[2mcreateAIStepExecutorFromConfig\x1b[0m');

test('returns null when config is null', () => {
	const executor = createAIStepExecutorFromConfig(null);
	assert.equal(executor, null);
});

test('creates executor from github-models config', () => {
	const executor = createAIStepExecutorFromConfig({
		provider: 'github-models',
		model: 'openai/gpt-4o-mini',
	});
	assert.ok(executor instanceof AIStepExecutor);
	assert.equal(executor.provider, 'github-models');
});

test('creates executor from openai config', () => {
	const executor = createAIStepExecutorFromConfig({
		provider: 'openai',
		apiKey: 'sk-test',
		model: 'gpt-4o',
	});
	assert.ok(executor instanceof AIStepExecutor);
	assert.equal(executor.provider, 'openai');
});

test('creates executor from anthropic config', () => {
	const executor = createAIStepExecutorFromConfig({
		provider: 'anthropic',
		apiKey: 'sk-ant-test',
	});
	assert.ok(executor instanceof AIStepExecutor);
	assert.equal(executor.provider, 'anthropic');
});

test('creates executor from ollama config', () => {
	const executor = createAIStepExecutorFromConfig({
		provider: 'ollama',
		baseUrl: 'http://localhost:11434',
	});
	assert.ok(executor instanceof AIStepExecutor);
	assert.equal(executor.provider, 'ollama');
});

test('passes debug and appContext options through', () => {
	const executor = createAIStepExecutorFromConfig(
		{ provider: 'github-models' },
		{ debug: true, appContext: 'Test app' },
	);
	assert.ok(executor instanceof AIStepExecutor);
});

// =========================================================================
// BddExecutor — AI integration
// =========================================================================

console.log('\n  \x1b[2mBddExecutor AI integration\x1b[0m');

test('BddExecutor accepts aiStepExecutor option', () => {
	const aiExecutor = createAIStepExecutor({ enabled: false });
	const executor = new BddExecutor({
		registry: new StepRegistry(),
		aiStepExecutor: aiExecutor,
	});
	assert.ok(executor instanceof BddExecutor);
});

test('BddExecutor works without aiStepExecutor (backward compat)', () => {
	const executor = new BddExecutor({
		registry: new StepRegistry(),
	});
	assert.ok(executor instanceof BddExecutor);
});

await testAsync('registered steps take priority over AI', async () => {
	const registry = new StepRegistry();
	let stepRan = false;
	registry.register('Given', 'I am ready', async () => {
		stepRan = true;
	});

	const doc = parseGherkin(`
Feature: Priority test
  Scenario: Registered step wins
    Given I am ready
`, 'priority.feature');

	const aiExecutor = createAIStepExecutor({ enabled: false });
	const executor = new BddExecutor({
		registry,
		aiStepExecutor: aiExecutor,
	});

	const result = await executor.runDocument(doc);
	assert.ok(stepRan, 'Registered step should have run');
	assert.equal(result.summary.steps.passed, 1);
});

await testAsync('undefined step with disabled AI falls through to undefined', async () => {
	const doc = parseGherkin(`
Feature: Fallthrough test
  Scenario: No step def and no AI
    Given something that has no definition
`, 'fallthrough.feature');

	const aiExecutor = createAIStepExecutor({ enabled: false });
	const executor = new BddExecutor({
		registry: new StepRegistry(),
		aiStepExecutor: aiExecutor,
	});

	const result = await executor.runDocument(doc);
	assert.equal(result.summary.steps.undefined, 1);
});

// =========================================================================
// worldFactory crash handling
// =========================================================================

console.log('\n  \x1b[2mworldFactory crash handling\x1b[0m');

await testAsync('handles synchronous worldFactory throw', async () => {
	const doc = parseGherkin(`
Feature: Crash test
  Scenario: World factory fails
    Given something
`, 'crash.feature');

	const executor = new BddExecutor({
		registry: new StepRegistry(),
		worldFactory: () => {
			throw new Error('Browser crashed!');
		},
	});

	const result = await executor.runDocument(doc);
	assert.equal(result.summary.scenarios.failed, 1);
	const scenario = result.features[0]?.scenarios[0];
	assert.equal(scenario?.status, 'failed');
	assert.equal(scenario?.hookError?.message, 'Browser crashed!');
});

await testAsync('handles async worldFactory rejection', async () => {
	const doc = parseGherkin(`
Feature: Async crash
  Scenario: Async world factory fails
    Given something
`, 'async-crash.feature');

	const executor = new BddExecutor({
		registry: new StepRegistry(),
		worldFactory: async () => {
			throw new Error('Page creation failed!');
		},
	});

	const result = await executor.runDocument(doc);
	assert.equal(result.summary.scenarios.failed, 1);
});

await testAsync('worldFactory error does not crash the entire run', async () => {
	const doc = parseGherkin(`
Feature: Multi scenario crash
  Scenario: First scenario - factory crash
    Given step one

  Scenario: Second scenario - also crashes
    Given step two
`, 'multi-crash.feature');

	const executor = new BddExecutor({
		registry: new StepRegistry(),
		worldFactory: () => {
			throw new Error('Always fails');
		},
	});

	const result = await executor.runDocument(doc);
	assert.equal(result.summary.scenarios.failed, 2);
	assert.equal(result.summary.scenarios.total, 2);
});

// =========================================================================
// Step timeout leak fix
// =========================================================================

console.log('\n  \x1b[2mStep timeout fix\x1b[0m');

await testAsync('fast step passes and clears its timeout', async () => {
	const registry = new StepRegistry();
	registry.register('Given', 'a fast step', async () => {
		// Instant
	});

	const doc = parseGherkin(`
Feature: Timeout test
  Scenario: Fast step
    Given a fast step
`, 'timeout.feature');

	const executor = new BddExecutor({
		registry,
		stepTimeout: 60000,
	});

	const result = await executor.runDocument(doc);
	assert.equal(result.summary.steps.passed, 1);
});

await testAsync('slow step fails when exceeding timeout', async () => {
	const registry = new StepRegistry();
	registry.register('Given', 'a slow step', async () => {
		await new Promise((r) => setTimeout(r, 5000));
	});

	const doc = parseGherkin(`
Feature: Timeout test
  Scenario: Slow step
    Given a slow step
`, 'slow-timeout.feature');

	const executor = new BddExecutor({
		registry,
		stepTimeout: 100,
	});

	const result = await executor.runDocument(doc);
	assert.equal(result.summary.steps.failed, 1);
	const step = result.features[0]?.scenarios[0]?.steps[0];
	assert.ok(step?.error?.message.includes('timed out'));
});

await testAsync('multiple sequential steps each clear their timeouts', async () => {
	const registry = new StepRegistry();
	let count = 0;
	registry.register('Any', 'step number {int}', async (world, n) => {
		count++;
		await new Promise((r) => setTimeout(r, 10));
	});

	const doc = parseGherkin(`
Feature: Multi-step timeout
  Scenario: Three fast steps
    Given step number 1
    When step number 2
    Then step number 3
`, 'multi-timeout.feature');

	const executor = new BddExecutor({
		registry,
		stepTimeout: 5000,
	});

	const result = await executor.runDocument(doc);
	assert.equal(count, 3);
	assert.equal(result.summary.steps.passed, 3);
});

// =========================================================================
// Summary
// =========================================================================

console.log(`\n  \x1b[1m${passed} passed, ${failed} failed\x1b[0m`);
if (failed > 0) process.exit(1);
