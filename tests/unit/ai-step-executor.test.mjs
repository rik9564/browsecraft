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
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

function createTempCache(entries) {
	const tempDir = mkdtempSync(join(tmpdir(), 'browsecraft-ai-step-'));
	const cachePath = join(tempDir, 'ai-cache.json');
	writeFileSync(cachePath, JSON.stringify(entries, null, 2), 'utf-8');
	return { tempDir, cachePath };
}

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

test('passes cache and timeout options through', () => {
	const executor = createAIStepExecutorFromConfig(
		{ provider: 'openai', apiKey: 'sk-test' },
		{
			cacheMode: 'locked',
			cachePath: null,
			confidenceThreshold: 0.95,
			cacheSize: 42,
			aiTimeout: 1234,
			actionTimeout: 5678,
		},
	);
	assert.ok(executor instanceof AIStepExecutor);
	assert.equal(executor.mode, 'locked');
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

	const doc = parseGherkin(
		`
Feature: Priority test
  Scenario: Registered step wins
    Given I am ready
`,
		'priority.feature',
	);

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
	const doc = parseGherkin(
		`
Feature: Fallthrough test
  Scenario: No step def and no AI
    Given something that has no definition
`,
		'fallthrough.feature',
	);

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
	const doc = parseGherkin(
		`
Feature: Crash test
  Scenario: World factory fails
    Given something
`,
		'crash.feature',
	);

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
	const doc = parseGherkin(
		`
Feature: Async crash
  Scenario: Async world factory fails
    Given something
`,
		'async-crash.feature',
	);

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
	const doc = parseGherkin(
		`
Feature: Multi scenario crash
  Scenario: First scenario - factory crash
    Given step one

  Scenario: Second scenario - also crashes
    Given step two
`,
		'multi-crash.feature',
	);

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

	const doc = parseGherkin(
		`
Feature: Timeout test
  Scenario: Fast step
    Given a fast step
`,
		'timeout.feature',
	);

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

	const doc = parseGherkin(
		`
Feature: Timeout test
  Scenario: Slow step
    Given a slow step
`,
		'slow-timeout.feature',
	);

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

	const doc = parseGherkin(
		`
Feature: Multi-step timeout
  Scenario: Three fast steps
    Given step number 1
    When step number 2
    Then step number 3
`,
		'multi-timeout.feature',
	);

	const executor = new BddExecutor({
		registry,
		stepTimeout: 5000,
	});

	const result = await executor.runDocument(doc);
	assert.equal(count, 3);
	assert.equal(result.summary.steps.passed, 3);
});

// =========================================================================
// Persistent Cache, Confidence Gate, Locked Mode
// =========================================================================

console.log('\n  \x1b[2mPersistent cache & modes\x1b[0m');

test('accepts cachePath config', () => {
	const executor = createAIStepExecutor({
		cachePath: '.browsecraft/test-cache.json',
	});
	assert.ok(executor instanceof AIStepExecutor);
});

test('cachePath null disables persistence', () => {
	const executor = createAIStepExecutor({
		cachePath: null,
	});
	assert.ok(executor instanceof AIStepExecutor);
});

test('accepts confidenceThreshold config', () => {
	const executor = createAIStepExecutor({
		confidenceThreshold: 0.9,
	});
	assert.ok(executor instanceof AIStepExecutor);
});

test('default mode is auto', () => {
	const executor = createAIStepExecutor();
	assert.equal(executor.mode, 'auto');
});

test('accepts locked mode', () => {
	const executor = createAIStepExecutor({
		cacheMode: 'locked',
	});
	assert.equal(executor.mode, 'locked');
});

test('accepts warm mode', () => {
	const executor = createAIStepExecutor({
		cacheMode: 'warm',
	});
	assert.equal(executor.mode, 'warm');
});

await testAsync('locked mode returns error for uncached step', async () => {
	const executor = createAIStepExecutor({
		cacheMode: 'locked',
		cachePath: null, // no disk cache to load
	});

	const result = await executor.executeStep('I click "Submit"', 'When', {});
	assert.equal(result.handled, false);
	assert.ok(result.error);
	assert.ok(result.error.message.includes('locked mode'));
	assert.ok(
		result.error.message.includes('no cached plan') ||
			result.error.message.includes('No cached plan'),
	);
});

await testAsync('locked mode does not call provider/network availability checks', async () => {
	const stepText = 'I click "Submit"';
	const cacheKey = stepText.trim().toLowerCase();
	const { tempDir, cachePath } = createTempCache([
		{
			key: cacheKey,
			plan: {
				actions: [{ method: 'click', args: ['Submit'], description: 'Click submit' }],
				isAssertion: false,
				confidence: 1,
				explanation: 'Click submit',
			},
		},
	]);

	const originalFetch = globalThis.fetch;
	let fetchCalls = 0;
	globalThis.fetch = () => {
		fetchCalls++;
		throw new Error('fetch should not be called in locked mode');
	};

	try {
		const executor = createAIStepExecutor({
			provider: {
				provider: 'openai',
				token: 'sk-test',
				baseUrl: 'https://example.invalid',
			},
			cacheMode: 'locked',
			cachePath,
		});
		const clicks = [];
		const page = {
			click: (target) => {
				clicks.push(target);
			},
		};

		const result = await executor.executeStep(stepText, 'When', page);
		assert.equal(result.handled, true);
		assert.equal(result.passed, true);
		assert.equal(fetchCalls, 0);
		assert.deepEqual(clicks, ['Submit']);
	} finally {
		globalThis.fetch = originalFetch;
		rmSync(tempDir, { recursive: true, force: true });
	}
});

await testAsync('enforces aiTimeout when provider call hangs', async () => {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = () => new Promise(() => {});

	try {
		const executor = createAIStepExecutor({
			provider: {
				provider: 'openai',
				token: 'sk-test',
				baseUrl: 'https://example.invalid',
			},
			aiTimeout: 25,
			cachePath: null,
		});

		// Bypass availability probe so the test exercises interpretStep timeout path.
		executor.aiAvailable = true;

		const start = Date.now();
		const result = await executor.executeStep('I click "Submit"', 'When', {});
		const elapsed = Date.now() - start;

		assert.equal(result.handled, false);
		assert.ok(result.error);
		assert.ok(elapsed < 500, `Expected aiTimeout to trigger quickly, got ${elapsed}ms`);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

await testAsync('rejects evaluate in non-assertion cached plans', async () => {
	const stepText = 'I run a script';
	const cacheKey = stepText.trim().toLowerCase();
	const { tempDir, cachePath } = createTempCache([
		{
			key: cacheKey,
			plan: {
				actions: [{ method: 'evaluate', args: ['1 + 1'], description: 'Run JS' }],
				isAssertion: false,
				confidence: 1,
				explanation: 'Run a script',
			},
		},
	]);

	try {
		const executor = createAIStepExecutor({
			cacheMode: 'locked',
			cachePath,
		});

		const result = await executor.executeStep(stepText, 'When', {});
		assert.equal(result.handled, true);
		assert.equal(result.passed, false);
		assert.ok(result.error);
		assert.ok(result.error.message.includes('evaluate'));
		assert.ok(result.error.message.includes('assertion'));
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

await testAsync('enforces actionTimeout for long-running cached actions', async () => {
	const stepText = 'I click "Submit"';
	const cacheKey = stepText.trim().toLowerCase();
	const { tempDir, cachePath } = createTempCache([
		{
			key: cacheKey,
			plan: {
				actions: [{ method: 'click', args: ['Submit'], description: 'Click submit' }],
				isAssertion: false,
				confidence: 1,
				explanation: 'Click submit',
			},
		},
	]);

	try {
		const executor = createAIStepExecutor({
			cacheMode: 'locked',
			cachePath,
			actionTimeout: 25,
		});

		const page = {
			click: () => new Promise(() => {}),
		};

		const start = Date.now();
		const result = await executor.executeStep(stepText, 'When', page);
		const elapsed = Date.now() - start;

		assert.equal(result.handled, true);
		assert.equal(result.passed, false);
		assert.ok(result.error);
		assert.ok(result.error.message.includes('Action timed out'));
		assert.ok(elapsed < 500, `Expected action timeout to trigger quickly, got ${elapsed}ms`);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test('full config with all new options', () => {
	const executor = createAIStepExecutor({
		provider: { provider: 'openai', token: 'sk-test' },
		cachePath: '/tmp/test-cache.json',
		confidenceThreshold: 0.95,
		cacheMode: 'warm',
		cacheSize: 100,
		debug: true,
	});
	assert.ok(executor instanceof AIStepExecutor);
	assert.equal(executor.provider, 'openai');
	assert.equal(executor.mode, 'warm');
});

// =========================================================================
// Summary
// =========================================================================

console.log(`\n  \x1b[1m${passed} passed, ${failed} failed\x1b[0m`);
if (failed > 0) process.exit(1);
