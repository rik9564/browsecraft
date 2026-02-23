#!/usr/bin/env node

// ============================================================================
// Unit Tests — Tag Expression Parser & Evaluator
// ============================================================================

import assert from 'node:assert/strict';
import {
	parseTagExpression,
	evaluateTagExpression,
	matchesTags,
	tagsMatch,
} from '../../packages/browsecraft-bdd/dist/index.js';

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

console.log('\n\x1b[1mTag Expression Tests\x1b[0m\n');

// -----------------------------------------------------------------------
// parseTagExpression — AST structure
// -----------------------------------------------------------------------

test('parse a single tag', () => {
	const expr = parseTagExpression('@smoke');
	assert.equal(expr.type, 'tag');
	assert.equal(expr.name, '@smoke');
});

test('parse AND expression', () => {
	const expr = parseTagExpression('@smoke and @fast');
	assert.equal(expr.type, 'and');
	assert.equal(expr.left.type, 'tag');
	assert.equal(expr.right.type, 'tag');
});

test('parse OR expression', () => {
	const expr = parseTagExpression('@smoke or @regression');
	assert.equal(expr.type, 'or');
});

test('parse NOT expression', () => {
	const expr = parseTagExpression('not @wip');
	assert.equal(expr.type, 'not');
	assert.equal(expr.operand.type, 'tag');
	assert.equal(expr.operand.name, '@wip');
});

test('parse parenthesized expression', () => {
	const expr = parseTagExpression('(@smoke or @regression) and not @wip');
	assert.equal(expr.type, 'and');
	assert.equal(expr.left.type, 'or');
	assert.equal(expr.right.type, 'not');
});

test('parse nested NOT', () => {
	const expr = parseTagExpression('not not @wip');
	assert.equal(expr.type, 'not');
	assert.equal(expr.operand.type, 'not');
	assert.equal(expr.operand.operand.name, '@wip');
});

test('throws on empty expression', () => {
	assert.throws(() => parseTagExpression(''), /Empty tag expression/);
	assert.throws(() => parseTagExpression('   '), /Empty tag expression/);
});

test('throws on invalid character', () => {
	assert.throws(() => parseTagExpression('!@smoke'), /Unexpected character/);
});

test('throws on lone @', () => {
	assert.throws(() => parseTagExpression('@ and @smoke'), /lone '@'/);
});

// -----------------------------------------------------------------------
// evaluateTagExpression
// -----------------------------------------------------------------------

test('evaluate single tag — match', () => {
	const expr = parseTagExpression('@smoke');
	assert.equal(evaluateTagExpression(expr, ['@smoke', '@fast']), true);
});

test('evaluate single tag — no match', () => {
	const expr = parseTagExpression('@smoke');
	assert.equal(evaluateTagExpression(expr, ['@regression']), false);
});

test('evaluate AND — both present', () => {
	const expr = parseTagExpression('@smoke and @fast');
	assert.equal(evaluateTagExpression(expr, ['@smoke', '@fast']), true);
});

test('evaluate AND — one missing', () => {
	const expr = parseTagExpression('@smoke and @fast');
	assert.equal(evaluateTagExpression(expr, ['@smoke']), false);
});

test('evaluate OR — one present', () => {
	const expr = parseTagExpression('@smoke or @regression');
	assert.equal(evaluateTagExpression(expr, ['@regression']), true);
});

test('evaluate OR — none present', () => {
	const expr = parseTagExpression('@smoke or @regression');
	assert.equal(evaluateTagExpression(expr, ['@wip']), false);
});

test('evaluate NOT — tag absent', () => {
	const expr = parseTagExpression('not @wip');
	assert.equal(evaluateTagExpression(expr, ['@smoke']), true);
});

test('evaluate NOT — tag present', () => {
	const expr = parseTagExpression('not @wip');
	assert.equal(evaluateTagExpression(expr, ['@wip']), false);
});

test('evaluate complex: (@smoke or @regression) and not @wip', () => {
	const expr = parseTagExpression('(@smoke or @regression) and not @wip');
	assert.equal(evaluateTagExpression(expr, ['@smoke']), true);
	assert.equal(evaluateTagExpression(expr, ['@regression']), true);
	assert.equal(evaluateTagExpression(expr, ['@smoke', '@wip']), false);
	assert.equal(evaluateTagExpression(expr, ['@other']), false);
});

test('evaluate with empty tag set', () => {
	const expr = parseTagExpression('@smoke');
	assert.equal(evaluateTagExpression(expr, []), false);
});

// -----------------------------------------------------------------------
// matchesTags — convenience
// -----------------------------------------------------------------------

test('matchesTags returns true when expression matches', () => {
	assert.equal(matchesTags('@smoke', ['@smoke', '@fast']), true);
});

test('matchesTags returns false when no match', () => {
	assert.equal(matchesTags('@slow', ['@smoke', '@fast']), false);
});

test('matchesTags works with complex expression', () => {
	assert.equal(matchesTags('@smoke and not @slow', ['@smoke', '@fast']), true);
	assert.equal(matchesTags('@smoke and not @slow', ['@smoke', '@slow']), false);
});

// -----------------------------------------------------------------------
// tagsMatch — simple single-tag fast path + full expression
// -----------------------------------------------------------------------

test('tagsMatch single tag — fast path', () => {
	assert.equal(tagsMatch('@smoke', ['@smoke']), true);
	assert.equal(tagsMatch('@smoke', ['@fast']), false);
});

test('tagsMatch complex expression', () => {
	assert.equal(tagsMatch('@smoke or @regression', ['@regression']), true);
});

test('tagsMatch with whitespace-only tag routes to expression parser', () => {
	assert.equal(tagsMatch('  @smoke  ', ['@smoke']), true);
});

// -----------------------------------------------------------------------
// Operator precedence
// -----------------------------------------------------------------------

test('AND binds tighter than OR', () => {
	// "@a or @b and @c" should be parsed as "@a or (@b and @c)"
	assert.equal(matchesTags('@a or @b and @c', ['@a']), true);
	assert.equal(matchesTags('@a or @b and @c', ['@b', '@c']), true);
	assert.equal(matchesTags('@a or @b and @c', ['@b']), false);
});

// -----------------------------------------------------------------------
// Edge cases
// -----------------------------------------------------------------------

test('tags with hyphens and underscores', () => {
	assert.equal(matchesTags('@end-to-end', ['@end-to-end']), true);
	assert.equal(matchesTags('@test_suite', ['@test_suite']), true);
});

test('case-insensitive keywords (and/AND/And)', () => {
	assert.equal(matchesTags('@a AND @b', ['@a', '@b']), true);
	assert.equal(matchesTags('@a Or @b', ['@b']), true);
	assert.equal(matchesTags('NOT @wip', ['@smoke']), true);
});

// -----------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------

console.log(`\n  Tags: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
