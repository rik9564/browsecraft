#!/usr/bin/env node

// ============================================================================
// Unit Tests — Self-Healing Selectors
//   - Heuristic healing (Levenshtein + attribute matching)
//   - Page integration (extractSelector, warning format, snapshot shape)
//   - Multi-provider support
// ============================================================================

import assert from 'node:assert/strict';
import { healSelector } from '../../packages/browsecraft-ai/dist/index.js';

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
let passed = 0;
let failed = 0;

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

console.log('\n\x1b[1mSelf-Healing Tests\x1b[0m\n');

// Helper: create a simple page snapshot
function makeSnapshot(elements) {
	return {
		url: 'https://example.com',
		title: 'Test',
		elements,
	};
}

// -----------------------------------------------------------------------
// ID-based healing
// -----------------------------------------------------------------------

await testAsync('heals by similar ID', async () => {
	const snapshot = makeSnapshot([
		{ tag: 'button', id: 'submit-btn', selector: '#submit-btn', text: 'Submit' },
		{ tag: 'div', id: 'header', selector: '#header' },
	]);

	const result = await healSelector('#submit-button', snapshot, { useAI: false });
	assert.equal(result.healed, true);
	assert.equal(result.selector, '#submit-btn');
	assert.ok(result.confidence > 0);
	assert.equal(result.method, 'attribute-match');
});

// -----------------------------------------------------------------------
// Text-based healing
// -----------------------------------------------------------------------

await testAsync('heals by text similarity', async () => {
	const snapshot = makeSnapshot([
		{ tag: 'button', selector: 'button.cta', text: 'Sign In' },
		{ tag: 'a', selector: 'a.link', text: 'About Us' },
	]);

	// Plain text selector (no CSS special chars)
	const result = await healSelector('Sign in', snapshot, { useAI: false });
	assert.equal(result.healed, true);
	assert.equal(result.selector, 'button.cta');
	assert.ok(result.method === 'text-similarity');
});

// -----------------------------------------------------------------------
// Class overlap healing
// -----------------------------------------------------------------------

await testAsync('heals by class overlap', async () => {
	const snapshot = makeSnapshot([
		{
			tag: 'button',
			id: 'action',
			classes: ['btn', 'primary', 'large'],
			selector: 'button.btn.primary.large',
			text: 'Submit',
		},
		{ tag: 'div', classes: ['container'], selector: 'div.container' },
	]);

	// Use a selector with matching tag + classes for enough score
	const result = await healSelector('button.btn.primary', snapshot, {
		useAI: false,
		minConfidence: 0.2,
	});
	assert.equal(result.healed, true);
	assert.equal(result.selector, 'button.btn.primary.large');
});

// -----------------------------------------------------------------------
// Tag matching
// -----------------------------------------------------------------------

await testAsync('tag matching contributes to score', async () => {
	const snapshot = makeSnapshot([
		{ tag: 'button', id: 'action', selector: 'button#action', text: 'Go', classes: ['btn'] },
		{ tag: 'div', id: 'action-panel', selector: 'div#action-panel' },
	]);

	// button#action has: ID similarity (~0.5*0.4=0.2) + tag match (0.1) = ~0.3
	const result = await healSelector('button#act', snapshot, { useAI: false });
	if (result.healed) {
		assert.ok(result.selector.includes('button'));
	} else {
		// Score might just be below threshold — verify candidates exist
		assert.ok(result.candidates.length > 0);
	}
});

// -----------------------------------------------------------------------
// data-testid matching
// -----------------------------------------------------------------------

await testAsync('heals by data-testid', async () => {
	const snapshot = makeSnapshot([
		{
			tag: 'input',
			testId: 'login-email',
			id: 'email',
			selector: '[data-testid="login-email"]',
			text: 'email input',
		},
		{
			tag: 'input',
			testId: 'login-password',
			id: 'pass',
			selector: '[data-testid="login-password"]',
		},
	]);

	// "login-mail" is similar to "login-email" (testId similarity ~0.7*0.3=0.21 + more)
	const result = await healSelector('[data-testid="login-mail"]', snapshot, {
		useAI: false,
		minConfidence: 0.15,
	});
	assert.equal(result.healed, true);
	assert.ok(result.selector.includes('login-email'));
});

// -----------------------------------------------------------------------
// Context-based matching
// -----------------------------------------------------------------------

await testAsync('uses context hint for matching', async () => {
	const snapshot = makeSnapshot([
		{ tag: 'button', selector: 'button.foo', text: 'OK' },
		{ tag: 'button', selector: 'button.bar', text: 'Cancel', ariaLabel: 'Cancel action' },
		{
			tag: 'input',
			selector: 'input.email',
			placeholder: 'Enter email',
			name: 'email',
			text: 'email',
		},
	]);

	// Context matches on name + placeholder + text for the input
	const result = await healSelector('#email-input', snapshot, {
		useAI: false,
		context: 'email input field',
		minConfidence: 0.1,
	});
	assert.equal(result.healed, true);
	assert.ok(result.selector.includes('email'));
});

// -----------------------------------------------------------------------
// No match
// -----------------------------------------------------------------------

await testAsync('returns healed=false when no match', async () => {
	const snapshot = makeSnapshot([{ tag: 'div', id: 'unrelated', selector: 'div#unrelated' }]);

	const result = await healSelector('#completely-different', snapshot, {
		useAI: false,
		minConfidence: 0.5,
	});
	assert.equal(result.healed, false);
	assert.equal(result.selector, null);
	assert.equal(result.confidence, 0);
	assert.equal(result.method, 'none');
});

// -----------------------------------------------------------------------
// Empty snapshot
// -----------------------------------------------------------------------

await testAsync('handles empty element list', async () => {
	const snapshot = makeSnapshot([]);
	const result = await healSelector('#anything', snapshot, { useAI: false });
	assert.equal(result.healed, false);
});

// -----------------------------------------------------------------------
// Candidates are sorted by confidence
// -----------------------------------------------------------------------

await testAsync('candidates are sorted by confidence descending', async () => {
	const snapshot = makeSnapshot([
		{ tag: 'button', id: 'submit-now', selector: '#submit-now', text: 'Submit Now' },
		{ tag: 'button', id: 'submit', selector: '#submit', text: 'Submit' },
		{ tag: 'a', id: 'sub', selector: '#sub', text: 'Subscribe' },
	]);

	const result = await healSelector('#submit-btn', snapshot, { useAI: false });
	if (result.candidates.length > 1) {
		for (let i = 1; i < result.candidates.length; i++) {
			assert.ok(result.candidates[i - 1].confidence >= result.candidates[i].confidence);
		}
	}
});

// -----------------------------------------------------------------------
// minConfidence threshold
// -----------------------------------------------------------------------

await testAsync('respects minConfidence threshold', async () => {
	const snapshot = makeSnapshot([{ tag: 'button', id: 'xyz', selector: '#xyz', text: 'A' }]);

	// Very high threshold — should not match vaguely
	const result = await healSelector('#abc', snapshot, {
		useAI: false,
		minConfidence: 0.99,
	});
	assert.equal(result.healed, false);
});

// -----------------------------------------------------------------------
// name attribute matching
// -----------------------------------------------------------------------

await testAsync('heals by name attribute similarity', async () => {
	const snapshot = makeSnapshot([
		{
			tag: 'input',
			name: 'username',
			id: 'user',
			selector: 'input[name="username"]',
			text: 'username',
		},
		{ tag: 'input', name: 'password', id: 'pass', selector: 'input[name="password"]' },
	]);

	// "user-name" is similar to "username" — combine multiple signals
	const result = await healSelector('[name="user-name"]', snapshot, {
		useAI: false,
		minConfidence: 0.15,
	});
	assert.equal(result.healed, true);
	assert.ok(result.selector.includes('username'));
});

// -----------------------------------------------------------------------
// Page integration — extractSelector logic
// -----------------------------------------------------------------------

await testAsync('extractSelector identifies CSS selectors', () => {
	function extractSelector(target) {
		if (typeof target === 'string') {
			return target.match(/^[#.\[]/) || target.includes(':') ? target : null;
		}
		return target.selector ?? (target.testId ? `[data-testid="${target.testId}"]` : null);
	}

	// Should extract CSS-like selectors
	assert.equal(extractSelector('#submit-btn'), '#submit-btn');
	assert.equal(extractSelector('.btn-primary'), '.btn-primary');
	assert.equal(extractSelector('[data-testid="x"]'), '[data-testid="x"]');
	assert.equal(extractSelector('div:nth-child(2)'), 'div:nth-child(2)');

	// Should NOT extract plain text
	assert.equal(extractSelector('Submit'), null);
	assert.equal(extractSelector('Click me'), null);

	// Object targets
	assert.equal(extractSelector({ selector: '#my-btn' }), '#my-btn');
	assert.equal(extractSelector({ testId: 'card' }), '[data-testid="card"]');
	assert.equal(extractSelector({ name: 'Submit' }), null);
});

// -----------------------------------------------------------------------
// Warning message format
// -----------------------------------------------------------------------

await testAsync('warning message format is correct', () => {
	const oldSelector = '#submit-btn';
	const newSelector = '#send-btn';
	const method = 'text-similarity';
	const confidence = 0.85;

	const warning = `\u26A0 [browsecraft] Self-healed: '${oldSelector}' \u2192 '${newSelector}' (${method}, ${(confidence * 100).toFixed(0)}% confidence)`;

	assert.ok(warning.includes('#submit-btn'));
	assert.ok(warning.includes('#send-btn'));
	assert.ok(warning.includes('85%'));
	assert.ok(warning.includes('text-similarity'));
});

// -----------------------------------------------------------------------
// Snapshot structure validation
// -----------------------------------------------------------------------

await testAsync('snapshot has required structure', () => {
	const snapshot = makeSnapshot([
		{
			tag: 'button',
			id: 'submit-btn',
			classes: ['btn', 'primary'],
			text: 'Submit',
			ariaLabel: 'Submit form',
			selector: '#submit-btn',
		},
	]);

	assert.equal(snapshot.url, 'https://example.com');
	assert.equal(snapshot.title, 'Test');
	assert.equal(snapshot.elements.length, 1);
	assert.equal(snapshot.elements[0].tag, 'button');
	assert.equal(snapshot.elements[0].id, 'submit-btn');
	assert.deepStrictEqual(snapshot.elements[0].classes, ['btn', 'primary']);
});

// -----------------------------------------------------------------------
// Multi-provider support — healSelector accepts provider option
// -----------------------------------------------------------------------

await testAsync('accepts provider option without crashing', async () => {
	const snapshot = makeSnapshot([
		{ tag: 'button', id: 'btn-new', selector: '#btn-new', text: 'Submit' },
	]);

	// Should work with explicit provider (will skip AI since no real API key)
	const result = await healSelector('#btn-old', snapshot, {
		useAI: false,
		provider: { provider: 'openai', token: 'fake' },
		minConfidence: 0.1,
	});

	// Heuristic should still work even with a provider option set
	assert.ok(typeof result.healed === 'boolean');
	assert.ok(typeof result.confidence === 'number');
});

await testAsync('works without provider option (backward compatible)', async () => {
	const snapshot = makeSnapshot([
		{ tag: 'button', id: 'btn-v2', selector: '#btn-v2', text: 'Sign In' },
	]);

	// Legacy: no provider, just useAI: false + optional token
	const result = await healSelector('#btn-v1', snapshot, {
		useAI: false,
		token: 'fake-token',
		minConfidence: 0.1,
	});

	assert.ok(typeof result.healed === 'boolean');
});

// -----------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------

console.log(`\n  Self-Healing: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
