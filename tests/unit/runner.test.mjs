#!/usr/bin/env node

// ============================================================================
// Unit Tests — Test Runner (pure logic, no browser needed)
// ============================================================================

import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { TestRunner } from '../../packages/browsecraft-runner/dist/index.js';
import { classifyFailure } from '../../packages/browsecraft-runner/dist/index.js';

const __filename = fileURLToPath(import.meta.url);

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

console.log('\n\x1b[1mRunner Tests\x1b[0m\n');

// -----------------------------------------------------------------------
// TestRunner construction
// -----------------------------------------------------------------------

test('TestRunner can be instantiated', () => {
	const runner = new TestRunner({
		config: {
			browser: 'chrome',
			headless: true,
			timeout: 30000,
			retries: 0,
			screenshot: 'on-failure',
			baseURL: '',
			viewport: { width: 1280, height: 720 },
			maximized: false,
			workers: 1,
			testMatch: '**/*.test.{ts,js,mts,mjs}',
			outputDir: '.browsecraft',
			ai: 'auto',
			debug: false,
		},
	});
	assert.ok(runner);
});

// -----------------------------------------------------------------------
// discoverFiles — specific files
// -----------------------------------------------------------------------

test('discoverFiles with specific files that do not exist', () => {
	const runner = new TestRunner({
		config: {
			browser: 'chrome',
			headless: true,
			timeout: 30000,
			retries: 0,
			screenshot: 'on-failure',
			baseURL: '',
			viewport: { width: 1280, height: 720 },
			maximized: false,
			workers: 1,
			testMatch: '**/*.test.{ts,js}',
			outputDir: '.browsecraft',
			ai: 'auto',
			debug: false,
		},
		files: ['nonexistent.test.js'],
	});
	const files = runner.discoverFiles();
	// Non-existent file filtered out
	assert.equal(files.length, 0);
});

// -----------------------------------------------------------------------
// run() — integration-style with mocks
// -----------------------------------------------------------------------

await testAsync('run returns 0 when all tests pass', async () => {
	const runner = new TestRunner({
		config: {
			browser: 'chrome',
			headless: true,
			timeout: 30000,
			retries: 0,
			screenshot: 'on-failure',
			baseURL: '',
			viewport: { width: 1280, height: 720 },
			maximized: false,
			workers: 1,
			testMatch: '**/*.nonexistent-for-test.{ts,js}',
			outputDir: '.browsecraft',
			ai: 'auto',
			debug: false,
		},
	});

	const exitCode = await runner.run(
		async () => [], // no tests loaded
		async () => ({ title: '', suitePath: [], status: 'passed', duration: 10 }),
	);
	// No files found = 0
	assert.equal(exitCode, 0);
});

await testAsync('run returns 1 when a test fails', async () => {
	const runner = new TestRunner({
		config: {
			browser: 'chrome',
			headless: true,
			timeout: 30000,
			retries: 0,
			screenshot: 'on-failure',
			baseURL: '',
			viewport: { width: 1280, height: 720 },
			maximized: false,
			workers: 1,
			testMatch: '**/*.test.{ts,js}',
			outputDir: '.browsecraft',
			ai: 'auto',
			debug: false,
		},
		files: [__filename], // use this file as the "test file"
	});

	const exitCode = await runner.run(
		async () => [
			{
				title: 'failing test',
				suitePath: [],
				skip: false,
				only: false,
				options: {},
				fn: async () => {},
			},
		],
		async () => ({
			title: 'failing test',
			suitePath: [],
			status: 'failed',
			duration: 50,
			error: new Error('test failure'),
		}),
	);
	assert.equal(exitCode, 1);
});

await testAsync('run respects grep filter', async () => {
	const executions = [];
	const runner = new TestRunner({
		config: {
			browser: 'chrome',
			headless: true,
			timeout: 30000,
			retries: 0,
			screenshot: 'on-failure',
			baseURL: '',
			viewport: { width: 1280, height: 720 },
			maximized: false,
			workers: 1,
			testMatch: '**/*.test.{ts,js}',
			outputDir: '.browsecraft',
			ai: 'auto',
			debug: false,
		},
		files: [__filename],
		grep: 'special',
	});

	await runner.run(
		async () => [
			{
				title: 'normal test',
				suitePath: [],
				skip: false,
				only: false,
				options: {},
				fn: async () => {},
			},
			{
				title: 'special test',
				suitePath: [],
				skip: false,
				only: false,
				options: {},
				fn: async () => {},
			},
		],
		async (t) => {
			executions.push(t.title);
			return { title: t.title, suitePath: [], status: 'passed', duration: 10 };
		},
	);

	assert.equal(executions.length, 1);
	assert.equal(executions[0], 'special test');
});

await testAsync('run handles .only tests', async () => {
	const executions = [];
	const runner = new TestRunner({
		config: {
			browser: 'chrome',
			headless: true,
			timeout: 30000,
			retries: 0,
			screenshot: 'on-failure',
			baseURL: '',
			viewport: { width: 1280, height: 720 },
			maximized: false,
			workers: 1,
			testMatch: '**/*.test.{ts,js}',
			outputDir: '.browsecraft',
			ai: 'auto',
			debug: false,
		},
		files: [__filename],
	});

	await runner.run(
		async () => [
			{ title: 'test A', suitePath: [], skip: false, only: false, options: {}, fn: async () => {} },
			{ title: 'test B', suitePath: [], skip: false, only: true, options: {}, fn: async () => {} },
		],
		async (t) => {
			executions.push(t.title);
			return { title: t.title, suitePath: [], status: 'passed', duration: 10 };
		},
	);

	assert.equal(executions.length, 1);
	assert.equal(executions[0], 'test B');
});

await testAsync('run handles retries', async () => {
	let attemptCount = 0;
	const runner = new TestRunner({
		config: {
			browser: 'chrome',
			headless: true,
			timeout: 30000,
			retries: 2,
			screenshot: 'on-failure',
			baseURL: '',
			viewport: { width: 1280, height: 720 },
			maximized: false,
			workers: 1,
			testMatch: '**/*.test.{ts,js}',
			outputDir: '.browsecraft',
			ai: 'auto',
			debug: false,
		},
		files: [__filename],
	});

	await runner.run(
		async () => [
			{
				title: 'flaky test',
				suitePath: [],
				skip: false,
				only: false,
				options: {},
				fn: async () => {},
			},
		],
		async () => {
			attemptCount++;
			if (attemptCount < 3) {
				return {
					title: 'flaky test',
					suitePath: [],
					status: 'failed',
					duration: 10,
					error: new Error('flaky'),
				};
			}
			return { title: 'flaky test', suitePath: [], status: 'passed', duration: 10 };
		},
	);

	assert.equal(attemptCount, 3); // 1 initial + 2 retries
});

await testAsync('run bails after first failure when bail=true', async () => {
	const executions = [];
	const runner = new TestRunner({
		config: {
			browser: 'chrome',
			headless: true,
			timeout: 30000,
			retries: 0,
			screenshot: 'on-failure',
			baseURL: '',
			viewport: { width: 1280, height: 720 },
			maximized: false,
			workers: 1,
			testMatch: '**/*.test.{ts,js}',
			outputDir: '.browsecraft',
			ai: 'auto',
			debug: false,
		},
		files: [__filename, __filename],
		bail: true,
	});

	await runner.run(
		async () => [
			{ title: 'test', suitePath: [], skip: false, only: false, options: {}, fn: async () => {} },
		],
		async () => {
			executions.push('exec');
			return {
				title: 'test',
				suitePath: [],
				status: 'failed',
				duration: 10,
				error: new Error('fail'),
			};
		},
	);

	// Should only execute tests for the first file, bail on second
	assert.equal(executions.length, 1);
});

// -----------------------------------------------------------------------
// Smart Retry — classifyFailure (from browsecraft-runner)
// -----------------------------------------------------------------------

test('classifyFailure: TypeError is not retryable', () => {
	const c = classifyFailure(new TypeError('undefined is not a function'));
	assert.equal(c.category, 'script');
	assert.equal(c.retryable, false);
});

test('classifyFailure: generic timeout is retryable', () => {
	const c = classifyFailure(new Error('Timed out after 30000ms'));
	assert.equal(c.category, 'timeout');
	assert.equal(c.retryable, true);
});

test('classifyFailure: assertion pattern is not retryable', () => {
	const c = classifyFailure(new Error('Expected 5 to equal 3'));
	assert.equal(c.category, 'assertion');
	assert.equal(c.retryable, false);
});

test('classifyFailure: ECONNRESET is retryable', () => {
	const c = classifyFailure(new Error('read ECONNRESET'));
	assert.equal(c.category, 'network');
	assert.equal(c.retryable, true);
});

test('classifyFailure: unknown error defaults to retryable', () => {
	const c = classifyFailure(new Error('something happened'));
	assert.equal(c.category, 'unknown');
	assert.equal(c.retryable, true);
});

test('classifyFailure: error by name (ElementNotFoundError)', () => {
	const err = new Error('element not found');
	err.name = 'ElementNotFoundError';
	const c = classifyFailure(err);
	assert.equal(c.category, 'element');
	assert.equal(c.retryable, true);
});

// -----------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------

console.log(`\n  Runner: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
