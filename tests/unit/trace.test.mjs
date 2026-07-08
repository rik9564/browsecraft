#!/usr/bin/env node

// ============================================================================
// Unit Tests — TraceRecorder
// Verifies step recording, screenshot capture toggling, and JSON serialization
// used by config.trace ('on' / 'retain-on-failure') and `browsecraft show-trace`.
// ============================================================================

import assert from 'node:assert/strict';
import { TraceRecorder } from '../../packages/browsecraft/dist/index.js';

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
let passed = 0;
let failed = 0;

async function test(name, fn) {
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

console.log('\nTraceRecorder');

await test('records a step with action and target', async () => {
	const recorder = new TraceRecorder(false);
	await recorder.record('click', 'Submit', async () => Buffer.from(''));
	const steps = recorder.getSteps();
	assert.equal(steps.length, 1);
	assert.equal(steps[0].action, 'click');
	assert.equal(steps[0].target, 'Submit');
	assert.equal(typeof steps[0].timestamp, 'number');
});

await test('assigns sequential zero-based indexes', async () => {
	const recorder = new TraceRecorder(false);
	await recorder.record('click', 'A', async () => Buffer.from(''));
	await recorder.record('fill', 'B', async () => Buffer.from(''));
	const steps = recorder.getSteps();
	assert.equal(steps[0].index, 0);
	assert.equal(steps[1].index, 1);
});

await test('does not capture a screenshot when disabled', async () => {
	const recorder = new TraceRecorder(false);
	let called = false;
	await recorder.record('click', 'Submit', async () => {
		called = true;
		return Buffer.from('png-bytes');
	});
	assert.equal(called, false);
	assert.equal(recorder.getSteps()[0].screenshot, undefined);
});

await test('captures a base64 screenshot when enabled', async () => {
	const recorder = new TraceRecorder(true);
	await recorder.record('click', 'Submit', async () => Buffer.from('png-bytes'));
	const [step] = recorder.getSteps();
	assert.equal(step.screenshot, Buffer.from('png-bytes').toString('base64'));
});

await test('records the bounding box and page URL when provided', async () => {
	const recorder = new TraceRecorder(false);
	const box = { x: 1, y: 2, width: 3, height: 4 };
	await recorder.record(
		'click',
		'Submit',
		async () => Buffer.from(''),
		box,
		'https://example.com/login',
	);
	const [step] = recorder.getSteps();
	assert.deepStrictEqual(step.boundingBox, box);
	assert.equal(step.url, 'https://example.com/login');
});

await test('swallows screenshot failures without breaking the recorded step', async () => {
	const recorder = new TraceRecorder(true);
	await recorder.record('click', 'Submit', async () => {
		throw new Error('screenshot failed');
	});
	const steps = recorder.getSteps();
	assert.equal(steps.length, 1);
	assert.equal(steps[0].screenshot, undefined);
});

await test('captures a DOM snapshot when a capture function is provided', async () => {
	const recorder = new TraceRecorder(true);
	await recorder.record(
		'click',
		'Submit',
		async () => Buffer.from(''),
		undefined,
		undefined,
		async () => '<html><body>hi</body></html>',
	);
	const [step] = recorder.getSteps();
	assert.equal(step.domSnapshot, '<html><body>hi</body></html>');
});

await test('does not capture a DOM snapshot when screenshots are disabled', async () => {
	const recorder = new TraceRecorder(false);
	let called = false;
	await recorder.record(
		'click',
		'Submit',
		async () => Buffer.from(''),
		undefined,
		undefined,
		async () => {
			called = true;
			return '<html></html>';
		},
	);
	assert.equal(called, false);
	assert.equal(recorder.getSteps()[0].domSnapshot, undefined);
});

await test('swallows DOM snapshot failures without breaking the recorded step', async () => {
	const recorder = new TraceRecorder(true);
	await recorder.record(
		'click',
		'Submit',
		async () => Buffer.from(''),
		undefined,
		undefined,
		async () => {
			throw new Error('dom capture failed');
		},
	);
	const steps = recorder.getSteps();
	assert.equal(steps.length, 1);
	assert.equal(steps[0].domSnapshot, undefined);
});

await test('serializes to JSON with metadata and steps', async () => {
	const recorder = new TraceRecorder(false);
	await recorder.record('goto', 'https://example.com', async () => Buffer.from(''));
	const json = recorder.toJSON({ title: 'my test', suitePath: ['Suite'], status: 'passed' });
	const parsed = JSON.parse(json);
	assert.equal(parsed.title, 'my test');
	assert.deepStrictEqual(parsed.suitePath, ['Suite']);
	assert.equal(parsed.status, 'passed');
	assert.equal(parsed.steps.length, 1);
	assert.equal(parsed.steps[0].action, 'goto');
});

console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
