#!/usr/bin/env node

// ============================================================================
// Unit Tests — BDD Executor (computeSummary, pending)
// ============================================================================

import assert from 'node:assert/strict';
import { computeSummary, pending } from '../../packages/browsecraft-bdd/dist/index.js';

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
// Summary
// -----------------------------------------------------------------------

console.log(`\n  Executor: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
