#!/usr/bin/env node

// ============================================================================
// Unit Tests — Config resolution
// ============================================================================

import assert from 'node:assert/strict';
import {
	defineConfig,
	resolveAIConfig,
	resolveConfig,
} from '../../packages/browsecraft/dist/index.js';

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

console.log('\n\x1b[1mConfig Tests\x1b[0m\n');

// -----------------------------------------------------------------------
// resolveConfig — defaults
// -----------------------------------------------------------------------

test('returns defaults when called with no argument', () => {
	const cfg = resolveConfig();
	assert.equal(cfg.browser, 'chrome');
	assert.equal(cfg.headless, true);
	assert.equal(cfg.timeout, 30_000);
	assert.equal(cfg.retries, 0);
	assert.equal(cfg.screenshot, 'on-failure');
	assert.equal(cfg.baseURL, '');
	assert.deepEqual(cfg.viewport, { width: 1280, height: 720 });
	assert.equal(cfg.maximized, false);
	assert.ok(cfg.workers >= 1);
	assert.equal(cfg.testMatch, '**/*.test.{ts,js,mts,mjs}');
	assert.equal(cfg.outputDir, '.browsecraft');
	assert.equal(cfg.ai, 'auto');
	assert.equal(cfg.debug, false);
});

test('returns defaults when called with empty object', () => {
	const cfg = resolveConfig({});
	assert.equal(cfg.browser, 'chrome');
	assert.equal(cfg.headless, true);
});

test('returns defaults when called with undefined', () => {
	const cfg = resolveConfig(undefined);
	assert.equal(cfg.browser, 'chrome');
});

// -----------------------------------------------------------------------
// resolveConfig — partial overrides
// -----------------------------------------------------------------------

test('overrides browser', () => {
	const cfg = resolveConfig({ browser: 'firefox' });
	assert.equal(cfg.browser, 'firefox');
});

test('overrides timeout', () => {
	const cfg = resolveConfig({ timeout: 60_000 });
	assert.equal(cfg.timeout, 60_000);
	// Other defaults preserved
	assert.equal(cfg.browser, 'chrome');
});

test('overrides headless', () => {
	const cfg = resolveConfig({ headless: false });
	assert.equal(cfg.headless, false);
});

test('overrides retries', () => {
	const cfg = resolveConfig({ retries: 3 });
	assert.equal(cfg.retries, 3);
});

test('overrides screenshot mode', () => {
	const cfg = resolveConfig({ screenshot: 'always' });
	assert.equal(cfg.screenshot, 'always');
});

test('overrides baseURL', () => {
	const cfg = resolveConfig({ baseURL: 'http://localhost:3000' });
	assert.equal(cfg.baseURL, 'http://localhost:3000');
});

test('overrides viewport', () => {
	const cfg = resolveConfig({ viewport: { width: 800, height: 600 } });
	assert.deepEqual(cfg.viewport, { width: 800, height: 600 });
});

test('preserves default viewport when not provided', () => {
	const cfg = resolveConfig({ browser: 'firefox' });
	assert.deepEqual(cfg.viewport, { width: 1280, height: 720 });
});

test('overrides workers', () => {
	const cfg = resolveConfig({ workers: 4 });
	assert.equal(cfg.workers, 4);
});

test('overrides outputDir', () => {
	const cfg = resolveConfig({ outputDir: 'test-output' });
	assert.equal(cfg.outputDir, 'test-output');
});

test('overrides ai mode', () => {
	const cfg = resolveConfig({ ai: 'off' });
	assert.equal(cfg.ai, 'off');
});

test('overrides debug', () => {
	const cfg = resolveConfig({ debug: true });
	assert.equal(cfg.debug, true);
});

test('overrides maximized', () => {
	const cfg = resolveConfig({ maximized: true });
	assert.equal(cfg.maximized, true);
});

test('supports AI config object', () => {
	const aiCfg = { provider: 'github-models', model: 'gpt-4o' };
	const cfg = resolveConfig({ ai: aiCfg });
	assert.deepEqual(cfg.ai, aiCfg);
});

test('preserves unset fields from defaults', () => {
	const cfg = resolveConfig({ browser: 'edge' });
	assert.equal(cfg.headless, true);
	assert.equal(cfg.timeout, 30_000);
	assert.equal(cfg.retries, 0);
});

// -----------------------------------------------------------------------
// defineConfig — passthrough
// -----------------------------------------------------------------------

test('defineConfig returns input unchanged', () => {
	const input = { browser: 'firefox', timeout: 60_000 };
	const result = defineConfig(input);
	assert.deepEqual(result, input);
	assert.equal(result, input); // same reference
});

test('defineConfig with empty object', () => {
	const result = defineConfig({});
	assert.deepEqual(result, {});
});

// -----------------------------------------------------------------------
// resolveAIConfig
// -----------------------------------------------------------------------

console.log('\n  \x1b[2mresolveAIConfig\x1b[0m');

test('resolveAIConfig returns null for "off"', () => {
	assert.equal(resolveAIConfig('off'), null);
});

test('resolveAIConfig passes through explicit config object', () => {
	const config = { provider: 'openai', model: 'gpt-4o' };
	const result = resolveAIConfig(config);
	assert.deepEqual(result, config);
});

test('resolveAIConfig passes through github-models config', () => {
	const config = { provider: 'github-models', token: 'ghp_test' };
	const result = resolveAIConfig(config);
	assert.deepEqual(result, config);
});

test('resolveAIConfig "auto" with no env vars returns null', () => {
	// Save and clear relevant env vars
	const saved = {};
	const keys = [
		'BROWSECRAFT_AI_PROVIDER',
		'OPENAI_API_KEY',
		'ANTHROPIC_API_KEY',
		'GITHUB_TOKEN',
		'BROWSECRAFT_GITHUB_TOKEN',
		'OLLAMA_HOST',
	];
	for (const key of keys) {
		saved[key] = process.env[key];
		delete process.env[key];
	}

	try {
		const result = resolveAIConfig('auto');
		assert.equal(result, null);
	} finally {
		// Restore
		for (const key of keys) {
			if (saved[key] !== undefined) process.env[key] = saved[key];
		}
	}
});

test('resolveAIConfig "auto" detects GITHUB_TOKEN', () => {
	const saved = {};
	const keys = [
		'BROWSECRAFT_AI_PROVIDER',
		'OPENAI_API_KEY',
		'ANTHROPIC_API_KEY',
		'GITHUB_TOKEN',
		'BROWSECRAFT_GITHUB_TOKEN',
		'OLLAMA_HOST',
	];
	for (const key of keys) {
		saved[key] = process.env[key];
		delete process.env[key];
	}
	process.env.GITHUB_TOKEN = 'ghp_test_token';

	try {
		const result = resolveAIConfig('auto');
		assert.ok(result);
		assert.equal(result.provider, 'github-models');
	} finally {
		for (const key of keys) {
			if (saved[key] !== undefined) process.env[key] = saved[key];
			else delete process.env[key];
		}
	}
});

test('resolveAIConfig "auto" detects OPENAI_API_KEY', () => {
	const saved = {};
	const keys = [
		'BROWSECRAFT_AI_PROVIDER',
		'OPENAI_API_KEY',
		'ANTHROPIC_API_KEY',
		'GITHUB_TOKEN',
		'BROWSECRAFT_GITHUB_TOKEN',
		'OLLAMA_HOST',
	];
	for (const key of keys) {
		saved[key] = process.env[key];
		delete process.env[key];
	}
	process.env.OPENAI_API_KEY = 'sk-test';

	try {
		const result = resolveAIConfig('auto');
		assert.ok(result);
		assert.equal(result.provider, 'openai');
	} finally {
		for (const key of keys) {
			if (saved[key] !== undefined) process.env[key] = saved[key];
			else delete process.env[key];
		}
	}
});

test('resolveAIConfig "auto" detects ANTHROPIC_API_KEY', () => {
	const saved = {};
	const keys = [
		'BROWSECRAFT_AI_PROVIDER',
		'OPENAI_API_KEY',
		'ANTHROPIC_API_KEY',
		'GITHUB_TOKEN',
		'BROWSECRAFT_GITHUB_TOKEN',
		'OLLAMA_HOST',
	];
	for (const key of keys) {
		saved[key] = process.env[key];
		delete process.env[key];
	}
	process.env.ANTHROPIC_API_KEY = 'sk-ant-test';

	try {
		const result = resolveAIConfig('auto');
		assert.ok(result);
		assert.equal(result.provider, 'anthropic');
	} finally {
		for (const key of keys) {
			if (saved[key] !== undefined) process.env[key] = saved[key];
			else delete process.env[key];
		}
	}
});

test('resolveAIConfig "auto" BROWSECRAFT_AI_PROVIDER overrides auto-detect', () => {
	const saved = {};
	const keys = [
		'BROWSECRAFT_AI_PROVIDER',
		'OPENAI_API_KEY',
		'ANTHROPIC_API_KEY',
		'GITHUB_TOKEN',
		'BROWSECRAFT_GITHUB_TOKEN',
		'OLLAMA_HOST',
	];
	for (const key of keys) {
		saved[key] = process.env[key];
		delete process.env[key];
	}
	process.env.BROWSECRAFT_AI_PROVIDER = 'ollama';

	try {
		const result = resolveAIConfig('auto');
		assert.ok(result);
		assert.equal(result.provider, 'ollama');
	} finally {
		for (const key of keys) {
			if (saved[key] !== undefined) process.env[key] = saved[key];
			else delete process.env[key];
		}
	}
});

test('resolveAIConfig "auto" OpenAI takes priority over GitHub Models', () => {
	const saved = {};
	const keys = [
		'BROWSECRAFT_AI_PROVIDER',
		'OPENAI_API_KEY',
		'ANTHROPIC_API_KEY',
		'GITHUB_TOKEN',
		'BROWSECRAFT_GITHUB_TOKEN',
		'OLLAMA_HOST',
	];
	for (const key of keys) {
		saved[key] = process.env[key];
		delete process.env[key];
	}
	process.env.OPENAI_API_KEY = 'sk-test';
	process.env.GITHUB_TOKEN = 'ghp_test';

	try {
		const result = resolveAIConfig('auto');
		assert.ok(result);
		assert.equal(result.provider, 'openai');
	} finally {
		for (const key of keys) {
			if (saved[key] !== undefined) process.env[key] = saved[key];
			else delete process.env[key];
		}
	}
});

// -----------------------------------------------------------------------
// BddConfig — tagFilter and grep fields
// -----------------------------------------------------------------------

test('BddConfig tagFilter is preserved in config', () => {
	const cfg = resolveConfig({
		bdd: { tagFilter: '@smoke and not @wip', grep: 'login' },
	});
	assert.equal(cfg.bdd.tagFilter, '@smoke and not @wip');
	assert.equal(cfg.bdd.grep, 'login');
});

test('BddConfig defaults are optional', () => {
	const cfg = resolveConfig({ bdd: {} });
	assert.equal(cfg.bdd.tagFilter, undefined);
	assert.equal(cfg.bdd.grep, undefined);
	assert.equal(cfg.bdd.builtInSteps, undefined);
});

test('browsers config supports array of browser names', () => {
	const cfg = resolveConfig({ browsers: ['chrome', 'firefox', 'edge'] });
	assert.deepEqual(cfg.browsers, ['chrome', 'firefox', 'edge']);
	assert.equal(cfg.browser, 'chrome'); // default still set
});

test('strategy defaults to matrix', () => {
	const cfg = resolveConfig();
	assert.equal(cfg.strategy, 'matrix');
});

test('strategy can be overridden', () => {
	const cfg = resolveConfig({ strategy: 'sequential' });
	assert.equal(cfg.strategy, 'sequential');
});

test('workers defaults to at least 1', () => {
	const cfg = resolveConfig();
	assert.ok(cfg.workers >= 1);
});

// -----------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------

console.log(`\n  Config: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
