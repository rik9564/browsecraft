#!/usr/bin/env node

// ============================================================================
// Unit Tests — ResultAggregator
// Exhaustive tests for matrix building, flaky detection, timing, formatting.
// ============================================================================

import assert from 'node:assert/strict';
import { ResultAggregator } from '../../packages/browsecraft-runner/dist/index.js';

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

console.log('\n\x1b[1mResultAggregator Tests\x1b[0m\n');

// Helper factories

function makeResult(itemId, browser, status, duration, opts = {}) {
	return {
		item: {
			id: itemId,
			title: opts.title || `Scenario ${itemId}`,
			file: opts.file || 'test.feature',
			suitePath: opts.suitePath || ['Feature'],
			tags: opts.tags,
		},
		worker: {
			id: `${browser}-0`,
			browser,
			index: 0,
		},
		status,
		duration,
		error: opts.error,
		retries: opts.retries,
	};
}

function makeSchedulerResult(allResults, browserNames, opts = {}) {
	const browsers = browserNames.map((browser) => {
		const results = allResults.filter((r) => r.worker.browser === browser);
		return {
			browser,
			results,
			passed: results.filter((r) => r.status === 'passed').length,
			failed: results.filter((r) => r.status === 'failed').length,
			skipped: results.filter((r) => r.status === 'skipped').length,
			duration: results.reduce((s, r) => s + r.duration, 0),
		};
	});

	return {
		browsers,
		allResults,
		totalPassed: allResults.filter((r) => r.status === 'passed').length,
		totalFailed: allResults.filter((r) => r.status === 'failed').length,
		totalSkipped: allResults.filter((r) => r.status === 'skipped').length,
		totalDuration: opts.totalDuration ?? 500,
		strategy: opts.strategy ?? 'matrix',
	};
}

// -----------------------------------------------------------------------
// Basic aggregation
// -----------------------------------------------------------------------

test('aggregate produces correct totals', () => {
	const agg = new ResultAggregator();
	const results = [
		makeResult('1', 'chrome', 'passed', 100),
		makeResult('2', 'chrome', 'failed', 50, { error: new Error('fail') }),
		makeResult('3', 'chrome', 'skipped', 0),
	];
	const sr = makeSchedulerResult(results, ['chrome']);
	const summary = agg.aggregate(sr);

	assert.equal(summary.totals.scenarios, 3);
	assert.equal(summary.totals.passed, 1);
	assert.equal(summary.totals.failed, 1);
	assert.equal(summary.totals.skipped, 1);
});

test('aggregate handles empty results', () => {
	const agg = new ResultAggregator();
	const sr = makeSchedulerResult([], ['chrome']);
	const summary = agg.aggregate(sr);

	assert.equal(summary.totals.scenarios, 0);
	assert.equal(summary.totals.passed, 0);
	assert.equal(summary.timing.min, 0);
});

// -----------------------------------------------------------------------
// Matrix building
// -----------------------------------------------------------------------

test('builds scenario × browser matrix', () => {
	const agg = new ResultAggregator();
	const results = [
		makeResult('1', 'chrome', 'passed', 100),
		makeResult('1', 'firefox', 'passed', 120),
		makeResult('2', 'chrome', 'passed', 80),
		makeResult('2', 'firefox', 'failed', 90, { error: new Error('err') }),
	];
	const sr = makeSchedulerResult(results, ['chrome', 'firefox']);
	const summary = agg.aggregate(sr);

	assert.equal(summary.matrix.length, 2); // 2 scenarios
	const row1 = summary.matrix.find((r) => r.id === '1');
	assert.ok(row1);
	assert.equal(row1.browsers.get('chrome').status, 'passed');
	assert.equal(row1.browsers.get('firefox').status, 'passed');

	const row2 = summary.matrix.find((r) => r.id === '2');
	assert.ok(row2);
	assert.equal(row2.browsers.get('chrome').status, 'passed');
	assert.equal(row2.browsers.get('firefox').status, 'failed');
});

test('matrix marks not-run for missing browser', () => {
	const agg = new ResultAggregator();
	const results = [
		makeResult('1', 'chrome', 'passed', 100),
		// No firefox result for scenario 1
	];
	const sr = makeSchedulerResult(results, ['chrome', 'firefox']);
	const summary = agg.aggregate(sr);

	const row = summary.matrix[0];
	assert.equal(row.browsers.get('chrome').status, 'passed');
	assert.equal(row.browsers.get('firefox').status, 'not-run');
});

// -----------------------------------------------------------------------
// Cross-browser inconsistency
// -----------------------------------------------------------------------

test('detects cross-browser inconsistency', () => {
	const agg = new ResultAggregator();
	const results = [
		makeResult('1', 'chrome', 'passed', 100),
		makeResult('1', 'firefox', 'failed', 50, { error: new Error('ff fail') }),
	];
	const sr = makeSchedulerResult(results, ['chrome', 'firefox']);
	const summary = agg.aggregate(sr);

	assert.equal(summary.totals.crossBrowserInconsistent, 1);
	assert.equal(summary.inconsistentTests.length, 1);
	assert.equal(summary.matrix[0].crossBrowserInconsistent, true);
});

test('no inconsistency when all browsers agree', () => {
	const agg = new ResultAggregator();
	const results = [
		makeResult('1', 'chrome', 'passed', 100),
		makeResult('1', 'firefox', 'passed', 120),
	];
	const sr = makeSchedulerResult(results, ['chrome', 'firefox']);
	const summary = agg.aggregate(sr);

	assert.equal(summary.totals.crossBrowserInconsistent, 0);
	assert.equal(summary.matrix[0].crossBrowserInconsistent, false);
});

test('not-run status is excluded from inconsistency check', () => {
	const agg = new ResultAggregator();
	const results = [
		makeResult('1', 'chrome', 'passed', 100),
		// firefox not-run
	];
	const sr = makeSchedulerResult(results, ['chrome', 'firefox']);
	const summary = agg.aggregate(sr);

	// Only one non-not-run status, so no inconsistency
	assert.equal(summary.matrix[0].crossBrowserInconsistent, false);
});

// -----------------------------------------------------------------------
// Flaky detection
// -----------------------------------------------------------------------

test('detects flaky tests (passed after retries)', () => {
	const agg = new ResultAggregator();
	const results = [makeResult('1', 'chrome', 'passed', 100, { retries: 2 })];
	const sr = makeSchedulerResult(results, ['chrome']);
	const summary = agg.aggregate(sr);

	assert.equal(summary.totals.flaky, 1);
	assert.equal(summary.flakyTests.length, 1);
	assert.equal(summary.matrix[0].flaky, true);
});

test('non-flaky: failed with retries is not flaky', () => {
	const agg = new ResultAggregator();
	const results = [
		makeResult('1', 'chrome', 'failed', 100, { retries: 2, error: new Error('still fails') }),
	];
	const sr = makeSchedulerResult(results, ['chrome']);
	const summary = agg.aggregate(sr);

	assert.equal(summary.totals.flaky, 0);
	assert.equal(summary.matrix[0].flaky, false);
});

test('non-flaky: passed without retries is not flaky', () => {
	const agg = new ResultAggregator();
	const results = [makeResult('1', 'chrome', 'passed', 100)];
	const sr = makeSchedulerResult(results, ['chrome']);
	const summary = agg.aggregate(sr);

	assert.equal(summary.totals.flaky, 0);
});

test('flaky in one browser marks row as flaky', () => {
	const agg = new ResultAggregator();
	const results = [
		makeResult('1', 'chrome', 'passed', 100),
		makeResult('1', 'firefox', 'passed', 120, { retries: 1 }),
	];
	const sr = makeSchedulerResult(results, ['chrome', 'firefox']);
	const summary = agg.aggregate(sr);

	assert.equal(summary.matrix[0].flaky, true);
});

// -----------------------------------------------------------------------
// Timing statistics
// -----------------------------------------------------------------------

test('timing stats are computed correctly', () => {
	const agg = new ResultAggregator();
	const results = [
		makeResult('1', 'chrome', 'passed', 100),
		makeResult('2', 'chrome', 'passed', 200),
		makeResult('3', 'chrome', 'passed', 300),
		makeResult('4', 'chrome', 'passed', 400),
		makeResult('5', 'chrome', 'passed', 500),
	];
	const sr = makeSchedulerResult(results, ['chrome']);
	const summary = agg.aggregate(sr);

	assert.equal(summary.timing.min, 100);
	assert.equal(summary.timing.max, 500);
	assert.equal(summary.timing.avg, 300);
	assert.equal(summary.timing.median, 300);
	assert.equal(summary.timing.total, 1500);
});

test('timing stats handle single item', () => {
	const agg = new ResultAggregator();
	const results = [makeResult('1', 'chrome', 'passed', 42)];
	const sr = makeSchedulerResult(results, ['chrome']);
	const summary = agg.aggregate(sr);

	assert.equal(summary.timing.min, 42);
	assert.equal(summary.timing.max, 42);
	assert.equal(summary.timing.avg, 42);
	assert.equal(summary.timing.median, 42);
});

test('timing stats skip skipped items', () => {
	const agg = new ResultAggregator();
	const results = [
		makeResult('1', 'chrome', 'passed', 100),
		makeResult('2', 'chrome', 'skipped', 0),
	];
	const sr = makeSchedulerResult(results, ['chrome']);
	const summary = agg.aggregate(sr);

	assert.equal(summary.timing.min, 100);
	assert.equal(summary.timing.total, 100);
});

test('timing stats are all zero for empty results', () => {
	const agg = new ResultAggregator();
	const sr = makeSchedulerResult([], ['chrome']);
	const summary = agg.aggregate(sr);

	assert.equal(summary.timing.min, 0);
	assert.equal(summary.timing.max, 0);
	assert.equal(summary.timing.avg, 0);
	assert.equal(summary.timing.median, 0);
	assert.equal(summary.timing.p95, 0);
	assert.equal(summary.timing.total, 0);
});

// -----------------------------------------------------------------------
// Slowest tests
// -----------------------------------------------------------------------

test('slowestTests lists top 5 by duration', () => {
	const agg = new ResultAggregator();
	const results = [];
	for (let i = 1; i <= 8; i++) {
		results.push(makeResult(String(i), 'chrome', 'passed', i * 100));
	}
	const sr = makeSchedulerResult(results, ['chrome']);
	const summary = agg.aggregate(sr);

	assert.equal(summary.slowestTests.length, 5);
	assert.equal(summary.slowestTests[0].duration, 800);
	assert.equal(summary.slowestTests[4].duration, 400);
});

// -----------------------------------------------------------------------
// Failed tests
// -----------------------------------------------------------------------

test('failedTests lists all failures with error messages', () => {
	const agg = new ResultAggregator();
	const results = [
		makeResult('1', 'chrome', 'passed', 100),
		makeResult('2', 'chrome', 'failed', 50, { error: new Error('err A') }),
		makeResult('3', 'chrome', 'failed', 60, { error: new Error('err B') }),
	];
	const sr = makeSchedulerResult(results, ['chrome']);
	const summary = agg.aggregate(sr);

	assert.equal(summary.failedTests.length, 2);
	assert.equal(summary.failedTests[0].error, 'err A');
	assert.equal(summary.failedTests[1].error, 'err B');
});

// -----------------------------------------------------------------------
// Browser summaries
// -----------------------------------------------------------------------

test('browserSummaries match per-browser data', () => {
	const agg = new ResultAggregator();
	const results = [
		makeResult('1', 'chrome', 'passed', 100),
		makeResult('2', 'chrome', 'failed', 50, { error: new Error('x') }),
		makeResult('1', 'firefox', 'passed', 120),
		makeResult('2', 'firefox', 'passed', 80),
	];
	const sr = makeSchedulerResult(results, ['chrome', 'firefox']);
	const summary = agg.aggregate(sr);

	const chromeSummary = summary.browserSummaries.find((b) => b.browser === 'chrome');
	assert.equal(chromeSummary.passed, 1);
	assert.equal(chromeSummary.failed, 1);

	const ffSummary = summary.browserSummaries.find((b) => b.browser === 'firefox');
	assert.equal(ffSummary.passed, 2);
	assert.equal(ffSummary.failed, 0);
});

// -----------------------------------------------------------------------
// formatMatrix
// -----------------------------------------------------------------------

test('formatMatrix returns a string', () => {
	const agg = new ResultAggregator();
	const results = [
		makeResult('1', 'chrome', 'passed', 100),
		makeResult('1', 'firefox', 'failed', 50, { error: new Error('x') }),
	];
	const sr = makeSchedulerResult(results, ['chrome', 'firefox']);
	const summary = agg.aggregate(sr);
	const output = agg.formatMatrix(summary);

	assert.ok(typeof output === 'string');
	assert.ok(output.includes('Scenario'));
	assert.ok(output.includes('chrome'));
	assert.ok(output.includes('firefox'));
});

test('formatMatrix shows flaky and inconsistent flags', () => {
	const agg = new ResultAggregator();
	const results = [
		makeResult('1', 'chrome', 'passed', 100, { retries: 1 }),
		makeResult('1', 'firefox', 'passed', 120),
	];
	const sr = makeSchedulerResult(results, ['chrome', 'firefox']);
	const summary = agg.aggregate(sr);
	const output = agg.formatMatrix(summary);

	// Flaky flag should be present
	assert.ok(output.includes('🔄'));
});

test('formatMatrix truncates long titles', () => {
	const agg = new ResultAggregator();
	const longTitle = 'A'.repeat(50);
	const results = [makeResult('1', 'chrome', 'passed', 100, { title: longTitle })];
	const sr = makeSchedulerResult(results, ['chrome']);
	const summary = agg.aggregate(sr);
	const output = agg.formatMatrix(summary);

	assert.ok(output.includes('...'));
});

// -----------------------------------------------------------------------
// formatSummary
// -----------------------------------------------------------------------

test('formatSummary returns a string with strategy info', () => {
	const agg = new ResultAggregator();
	const results = [makeResult('1', 'chrome', 'passed', 100)];
	const sr = makeSchedulerResult(results, ['chrome'], { strategy: 'matrix' });
	const summary = agg.aggregate(sr);
	const output = agg.formatSummary(summary);

	assert.ok(typeof output === 'string');
	assert.ok(output.includes('matrix'));
	assert.ok(output.includes('chrome'));
});

test('formatSummary mentions flaky and inconsistent counts', () => {
	const agg = new ResultAggregator();
	const results = [
		makeResult('1', 'chrome', 'passed', 100, { retries: 1 }),
		makeResult('1', 'firefox', 'failed', 50, { error: new Error('x') }),
		makeResult('2', 'chrome', 'passed', 80),
		makeResult('2', 'firefox', 'passed', 90),
	];
	const sr = makeSchedulerResult(results, ['chrome', 'firefox']);
	const summary = agg.aggregate(sr);
	const output = agg.formatSummary(summary);

	assert.ok(output.includes('Flaky'));
	assert.ok(output.includes('inconsisten'));
});

// -----------------------------------------------------------------------
// Strategy and metadata
// -----------------------------------------------------------------------

test('summary includes strategy and browsers', () => {
	const agg = new ResultAggregator();
	const results = [makeResult('1', 'chrome', 'passed', 100)];
	const sr = makeSchedulerResult(results, ['chrome'], { strategy: 'sequential' });
	const summary = agg.aggregate(sr);

	assert.equal(summary.strategy, 'sequential');
	assert.deepStrictEqual(summary.browsers, ['chrome']);
});

test('summary includes totalDuration', () => {
	const agg = new ResultAggregator();
	const sr = makeSchedulerResult([], ['chrome'], { totalDuration: 1234 });
	const summary = agg.aggregate(sr);
	assert.equal(summary.totalDuration, 1234);
});

// -----------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------

console.log(`\n  ResultAggregator: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
