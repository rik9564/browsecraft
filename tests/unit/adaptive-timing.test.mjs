#!/usr/bin/env node

// ============================================================================
// Unit Tests — Adaptive Timing
// Tests the Page.adaptTimeout() multiplier and calibration logic.
//
// Since Page requires a live BiDi session we test the ALGORITHM directly
// by extracting the calibration math and verifying expected behavior.
// ============================================================================

import assert from 'node:assert/strict';

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

console.log('\n\x1b[1mAdaptive Timing Tests\x1b[0m\n');

// -----------------------------------------------------------------------
// Calibration formula: Math.max(1.0, Math.min(5.0, elapsed / 800))
// This is the exact same formula used in Page.goto()
// -----------------------------------------------------------------------

function calibrate(elapsedMs) {
	return Math.max(1.0, Math.min(5.0, elapsedMs / 800));
}

function adaptTimeout(multiplier, ms) {
	return Math.round(ms * multiplier);
}

// -----------------------------------------------------------------------
// Multiplier calculation
// -----------------------------------------------------------------------

test('fast environment (200ms load) keeps multiplier at 1.0', () => {
	const m = calibrate(200);
	assert.equal(m, 1.0);
});

test('normal environment (800ms load) gives multiplier 1.0', () => {
	const m = calibrate(800);
	assert.equal(m, 1.0);
});

test('slow environment (1600ms load) gives multiplier 2.0', () => {
	const m = calibrate(1600);
	assert.equal(m, 2.0);
});

test('very slow CI (3200ms load) gives multiplier 4.0', () => {
	const m = calibrate(3200);
	assert.equal(m, 4.0);
});

test('extremely slow environment (8000ms) is capped at 5.0', () => {
	const m = calibrate(8000);
	assert.equal(m, 5.0);
});

test('instant load (0ms) keeps multiplier at 1.0', () => {
	const m = calibrate(0);
	assert.equal(m, 1.0);
});

test('multiplier never goes below 1.0 — timeouts never shrink', () => {
	for (const elapsed of [0, 50, 100, 200, 400, 799]) {
		const m = calibrate(elapsed);
		assert.ok(m >= 1.0, `elapsed=${elapsed} gave multiplier=${m}`);
	}
});

test('multiplier never exceeds 5.0 — sanity cap', () => {
	for (const elapsed of [4001, 5000, 10000, 100000]) {
		const m = calibrate(elapsed);
		assert.ok(m <= 5.0, `elapsed=${elapsed} gave multiplier=${m}`);
	}
});

// -----------------------------------------------------------------------
// Adapted timeout values
// -----------------------------------------------------------------------

test('adaptTimeout with multiplier 1.0 leaves timeout unchanged', () => {
	assert.equal(adaptTimeout(1.0, 5000), 5000);
	assert.equal(adaptTimeout(1.0, 30000), 30000);
});

test('adaptTimeout with multiplier 2.0 doubles the timeout', () => {
	assert.equal(adaptTimeout(2.0, 5000), 10000);
	assert.equal(adaptTimeout(2.0, 30000), 60000);
});

test('adaptTimeout with multiplier 3.75 scales correctly', () => {
	assert.equal(adaptTimeout(3.75, 5000), 18750);
	assert.equal(adaptTimeout(3.75, 1000), 3750);
});

test('adaptTimeout rounds to nearest integer', () => {
	const result = adaptTimeout(1.3, 333);
	assert.equal(typeof result, 'number');
	assert.equal(result, Math.round(333 * 1.3));
});

// -----------------------------------------------------------------------
// Calibration is one-shot (only first goto)
// -----------------------------------------------------------------------

test('calibration state machine — first call calibrates, subsequent no-ops', () => {
	let timingMultiplier = 1.0;
	let timingCalibrated = false;

	function simulateGoto(navDurationMs) {
		if (!timingCalibrated) {
			timingCalibrated = true;
			timingMultiplier = calibrate(navDurationMs);
		}
	}

	// First nav: slow (2400ms → multiplier 3.0)
	simulateGoto(2400);
	assert.equal(timingMultiplier, 3.0);

	// Second nav: fast (100ms) — should NOT recalibrate
	simulateGoto(100);
	assert.equal(timingMultiplier, 3.0); // Still 3.0
});

// -----------------------------------------------------------------------
// ensureActionable cap with multiplier
// -----------------------------------------------------------------------

test('ensureActionable cap of 5000ms scales with multiplier', () => {
	const base = 5000;
	// On a 2x-slow machine, the cap becomes 10s
	assert.equal(adaptTimeout(2.0, Math.min(30000, base)), 10000);
	// On a 1x machine, the cap stays 5s
	assert.equal(adaptTimeout(1.0, Math.min(30000, base)), 5000);
	// On a 3x-slow machine, the cap becomes 15s
	assert.equal(adaptTimeout(3.0, Math.min(30000, base)), 15000);
});

// -----------------------------------------------------------------------
// Edge cases
// -----------------------------------------------------------------------

test('handles fractional milliseconds in elapsed time', () => {
	const m = calibrate(1200.5);
	assert.ok(m > 1.0);
	assert.ok(m < 2.0);
});

test('handles very large config timeouts', () => {
	const result = adaptTimeout(5.0, 120000);
	assert.equal(result, 600000); // 10 minutes — but capped by multiplier
});

// -----------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------

console.log(`\n  Adaptive Timing: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
