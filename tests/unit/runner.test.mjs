#!/usr/bin/env node

// ============================================================================
// Unit Tests — Test Runner (pure logic, no browser needed)
// ============================================================================

import assert from 'node:assert/strict';
import { TestRunner } from '../../packages/browsecraft-runner/dist/index.js';

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
		files: [import.meta.url.replace('file:///', '')], // use this file as the "test file"
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
		files: [import.meta.url.replace('file:///', '')],
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
		files: [import.meta.url.replace('file:///', '')],
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
		files: [import.meta.url.replace('file:///', '')],
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
		files: [import.meta.url.replace('file:///', ''), import.meta.url.replace('file:///', '')],
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
// Summary
// -----------------------------------------------------------------------

console.log(`\n  Runner: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
