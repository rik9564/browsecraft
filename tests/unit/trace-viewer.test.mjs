#!/usr/bin/env node

// ============================================================================
// Unit Tests — renderTraceViewerHtml
// Verifies the self-contained trace viewer HTML: structure, embedded trace
// data, and safe escaping of user-controlled strings (titles/targets).
// ============================================================================

import assert from 'node:assert/strict';
import { renderTraceViewerHtml } from '../../packages/browsecraft/dist/index.js';

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

console.log('\nrenderTraceViewerHtml()');

const sampleTrace = {
	title: 'user can log in',
	suitePath: ['Login'],
	status: 'passed',
	steps: [
		{ index: 0, timestamp: 1000, action: 'click', target: 'Submit' },
		{ index: 1, timestamp: 1200, action: 'fill', target: 'Email', screenshot: 'aGVsbG8=' },
	],
};

test('produces a well-formed standalone HTML document', () => {
	const html = renderTraceViewerHtml(sampleTrace);
	assert.match(html, /^<!doctype html>/);
	assert.match(html, /<\/html>\s*$/);
});

test('embeds the trace title and suite path', () => {
	const html = renderTraceViewerHtml(sampleTrace);
	assert.match(html, /Login .{1,3} user can log in/);
});

test('embeds the full trace data as JSON for client-side rendering', () => {
	const html = renderTraceViewerHtml(sampleTrace);
	assert.match(html, /"action":"click"/);
	assert.match(html, /"target":"Email"/);
	assert.match(html, /"screenshot":"aGVsbG8="/);
});

test('escapes HTML special characters in the title to prevent injection', () => {
	const trace = { ...sampleTrace, title: '<script>alert(1)</script>' };
	const html = renderTraceViewerHtml(trace);
	assert.ok(!html.includes('<script>alert(1)</script>'));
	assert.match(html, /&lt;script&gt;/);
});

test('neutralizes "</script>"-like sequences inside the embedded JSON payload', () => {
	const trace = {
		...sampleTrace,
		steps: [{ index: 0, timestamp: 0, action: 'click', target: '</script>' }],
	};
	const html = renderTraceViewerHtml(trace);
	assert.ok(!html.includes('target":"</script>'));
});

test('handles a trace with zero steps without throwing', () => {
	const trace = { title: 'empty', suitePath: [], status: 'passed', steps: [] };
	assert.doesNotThrow(() => renderTraceViewerHtml(trace));
});

test('embeds the bounding box for element-highlight overlay positioning', () => {
	const trace = {
		...sampleTrace,
		steps: [
			{
				index: 0,
				timestamp: 0,
				action: 'click',
				target: 'Submit',
				screenshot: 'aGVsbG8=',
				boundingBox: { x: 10, y: 20, width: 100, height: 40 },
			},
		],
	};
	const html = renderTraceViewerHtml(trace);
	assert.match(html, /"boundingBox":\{"x":10,"y":20,"width":100,"height":40\}/);
	assert.match(html, /id="highlight"/);
});

test('renders the filmstrip, search box, and status bar containers', () => {
	const html = renderTraceViewerHtml(sampleTrace);
	assert.match(html, /id="filmstrip"/);
	assert.match(html, /id="search"/);
	assert.match(html, /id="statusbar"/);
});

test('renders the fake browser chrome with a URL bar', () => {
	const html = renderTraceViewerHtml(sampleTrace);
	assert.match(html, /id="browser-chrome"/);
	assert.match(html, /id="url-bar"/);
	assert.match(html, /id="url-text"/);
});

test('renders the Gantt-style playback timeline container', () => {
	const html = renderTraceViewerHtml(sampleTrace);
	assert.match(html, /id="playback"/);
	assert.match(html, /id="gantt"/);
	assert.match(html, /ACTION_COLORS/);
});

test('embeds the per-step URL for the browser-chrome address bar', () => {
	const trace = {
		...sampleTrace,
		steps: [
			{
				index: 0,
				timestamp: 0,
				action: 'goto',
				target: 'https://example.com',
				url: 'https://example.com/login',
			},
		],
	};
	const html = renderTraceViewerHtml(trace);
	assert.match(html, /"url":"https:\/\/example\.com\/login"/);
});

test('renders the DOM-inspection toggle, iframe, and hover/inspector overlays', () => {
	const html = renderTraceViewerHtml(sampleTrace);
	assert.match(html, /id="mode-screenshot"/);
	assert.match(html, /id="mode-dom"/);
	assert.match(html, /id="dom-frame"/);
	assert.match(html, /id="dom-inspector"/);
	assert.match(html, /id="dom-hover-box"/);
});

test('sandboxes the DOM iframe with allow-same-origin but not allow-scripts', () => {
	const html = renderTraceViewerHtml(sampleTrace);
	assert.match(html, /<iframe id="dom-frame" sandbox="allow-same-origin">/);
});

test('embeds the per-step DOM snapshot and escapes </script> breakout attempts', () => {
	const trace = {
		...sampleTrace,
		steps: [
			{
				index: 0,
				timestamp: 0,
				action: 'click',
				target: 'Submit',
				domSnapshot: '<html><body><script>alert(1)</script></body></html>',
			},
		],
	};
	const html = renderTraceViewerHtml(trace);
	// The raw "<" characters in the embedded JSON must all be neutralized to <
	// so the literal sequence "</script>" never appears inside the <script> block.
	assert.ok(html.includes('\\u003chtml>\\u003cbody>\\u003cscript>alert(1)\\u003c/script>'));
	assert.ok(!html.includes('<script>alert(1)</script>'));
});

console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
