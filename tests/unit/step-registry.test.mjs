#!/usr/bin/env node

// ============================================================================
// Unit Tests — Step Registry & DataTable
// ============================================================================

import assert from 'node:assert/strict';
import {
	StepRegistry,
	BrowsecraftDataTable,
	globalRegistry,
	Given,
	When,
	Then,
	Step,
	defineParameterType,
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

console.log('\n\x1b[1mStep Registry Tests\x1b[0m\n');

// -----------------------------------------------------------------------
// StepRegistry — registration & matching
// -----------------------------------------------------------------------

test('register and match a simple string pattern', () => {
	const reg = new StepRegistry();
	const fn = () => {};
	reg.register('Given', 'I am on the homepage', fn);
	const match = reg.match('I am on the homepage');
	assert.ok(match);
	assert.equal(match.definition.fn, fn);
	assert.equal(match.args.length, 0);
});

test('match with {string} parameter', () => {
	const reg = new StepRegistry();
	reg.register('When', 'I click {string}', () => {});
	const match = reg.match('I click "Submit"');
	assert.ok(match);
	assert.equal(match.args.length, 1);
	assert.equal(match.args[0], 'Submit');
});

test('match with {int} parameter', () => {
	const reg = new StepRegistry();
	reg.register('Given', 'I have {int} items', () => {});
	const match = reg.match('I have 42 items');
	assert.ok(match);
	assert.equal(match.args[0], 42);
	assert.equal(typeof match.args[0], 'number');
});

test('match with {float} parameter', () => {
	const reg = new StepRegistry();
	reg.register('Then', 'the price is {float}', () => {});
	const match = reg.match('the price is 19.99');
	assert.ok(match);
	assert.equal(match.args[0], 19.99);
});

test('match with {word} parameter', () => {
	const reg = new StepRegistry();
	reg.register('Given', 'I am a {word}', () => {});
	const match = reg.match('I am a developer');
	assert.ok(match);
	assert.equal(match.args[0], 'developer');
});

test('match with multiple parameters', () => {
	const reg = new StepRegistry();
	reg.register('When', 'I type {string} into {string}', () => {});
	const match = reg.match('I type "hello" into "Username"');
	assert.ok(match);
	assert.equal(match.args[0], 'hello');
	assert.equal(match.args[1], 'Username');
});

test('match with regex pattern', () => {
	const reg = new StepRegistry();
	reg.register('Given', /I have (\d+) item(?:s)?/, () => {});
	const match = reg.match('I have 5 items');
	assert.ok(match);
	assert.equal(match.args[0], '5'); // regex returns strings
});

test('returns null for no match', () => {
	const reg = new StepRegistry();
	reg.register('Given', 'I am logged in', () => {});
	const match = reg.match('I am logged out');
	assert.equal(match, null);
});

test('respects step type filtering', () => {
	const reg = new StepRegistry();
	reg.register('Given', 'I am ready', () => {});
	// Should not match when keyword is 'When' (and type is not 'Any')
	const match = reg.match('I am ready', 'When');
	assert.equal(match, null);
});

test('type Any matches all keywords', () => {
	const reg = new StepRegistry();
	reg.register('Any', 'something universal', () => {});
	assert.ok(reg.match('something universal', 'Given'));
	assert.ok(reg.match('something universal', 'When'));
	assert.ok(reg.match('something universal', 'Then'));
});

// -----------------------------------------------------------------------
// Duplicate detection
// -----------------------------------------------------------------------

test('throws on duplicate step pattern', () => {
	const reg = new StepRegistry();
	reg.register('Given', 'I am here', () => {});
	assert.throws(
		() => reg.register('Given', 'I am here', () => {}),
		/Duplicate step definition/,
	);
});

// -----------------------------------------------------------------------
// Custom parameter types
// -----------------------------------------------------------------------

test('supports custom parameter types', () => {
	const reg = new StepRegistry();
	reg.defineParameterType({
		name: 'color',
		regex: '(red|green|blue)',
		transform: (s) => s.toUpperCase(),
	});
	reg.register('Given', 'I pick a {color} shirt', () => {});
	const match = reg.match('I pick a red shirt');
	assert.ok(match);
	assert.equal(match.args[0], 'RED');
});

// -----------------------------------------------------------------------
// getAll, clear, findUnmatched, suggest
// -----------------------------------------------------------------------

test('getAll returns all registrations', () => {
	const reg = new StepRegistry();
	reg.register('Given', 'step one', () => {});
	reg.register('When', 'step two', () => {});
	assert.equal(reg.getAll().length, 2);
});

test('clear removes all steps', () => {
	const reg = new StepRegistry();
	reg.register('Given', 'step', () => {});
	reg.clear();
	assert.equal(reg.getAll().length, 0);
});

test('findUnmatched returns unmatched step texts', () => {
	const reg = new StepRegistry();
	reg.register('Given', 'I am logged in', () => {});
	const unmatched = reg.findUnmatched(['I am logged in', 'I click something']);
	assert.equal(unmatched.length, 1);
	assert.equal(unmatched[0], 'I click something');
});

test('suggest returns similar step definitions', () => {
	const reg = new StepRegistry();
	reg.register('Given', 'I am on the homepage', () => {});
	reg.register('When', 'I click the button', () => {});
	const suggestions = reg.suggest('I am on the home page');
	assert.ok(suggestions.length > 0);
});

// -----------------------------------------------------------------------
// Tag scope
// -----------------------------------------------------------------------

test('tag-scoped step only matches with matching tags', () => {
	const reg = new StepRegistry();
	reg.register('Given', 'I am admin', () => {}, { tagScope: '@admin' });
	// Without matching tags
	const noMatch = reg.match('I am admin', undefined, ['@user']);
	assert.equal(noMatch, null);
	// With matching tags
	const match = reg.match('I am admin', undefined, ['@admin']);
	assert.ok(match);
});

// -----------------------------------------------------------------------
// BrowsecraftDataTable
// -----------------------------------------------------------------------

console.log('\n\x1b[1mDataTable Tests\x1b[0m\n');

test('raw() returns all rows as arrays', () => {
	const table = new BrowsecraftDataTable({
		rows: [
			{ cells: [{ value: 'name' }, { value: 'age' }], line: 1 },
			{ cells: [{ value: 'Alice' }, { value: '30' }], line: 2 },
			{ cells: [{ value: 'Bob' }, { value: '25' }], line: 3 },
		],
	});
	const raw = table.raw();
	assert.equal(raw.length, 3);
	assert.deepEqual(raw[0], ['name', 'age']);
});

test('headers() returns first row', () => {
	const table = new BrowsecraftDataTable({
		rows: [
			{ cells: [{ value: 'x' }, { value: 'y' }], line: 1 },
			{ cells: [{ value: '1' }, { value: '2' }], line: 2 },
		],
	});
	assert.deepEqual(table.headers(), ['x', 'y']);
});

test('rows() returns all rows except header', () => {
	const table = new BrowsecraftDataTable({
		rows: [
			{ cells: [{ value: 'h1' }], line: 1 },
			{ cells: [{ value: 'r1' }], line: 2 },
			{ cells: [{ value: 'r2' }], line: 3 },
		],
	});
	const rows = table.rows();
	assert.equal(rows.length, 2);
	assert.deepEqual(rows[0], ['r1']);
});

test('asObjects() converts to key-value objects', () => {
	const table = new BrowsecraftDataTable({
		rows: [
			{ cells: [{ value: 'name' }, { value: 'age' }], line: 1 },
			{ cells: [{ value: 'Alice' }, { value: '30' }], line: 2 },
		],
	});
	const objs = table.asObjects();
	assert.equal(objs.length, 1);
	assert.equal(objs[0].name, 'Alice');
	assert.equal(objs[0].age, '30');
});

test('asMap() converts two-column table to map', () => {
	const table = new BrowsecraftDataTable({
		rows: [
			{ cells: [{ value: 'key1' }, { value: 'val1' }], line: 1 },
			{ cells: [{ value: 'key2' }, { value: 'val2' }], line: 2 },
		],
	});
	const map = table.asMap();
	assert.equal(map.key1, 'val1');
	assert.equal(map.key2, 'val2');
});

test('column() returns a single column', () => {
	const table = new BrowsecraftDataTable({
		rows: [
			{ cells: [{ value: 'a' }, { value: 'b' }], line: 1 },
			{ cells: [{ value: 'c' }, { value: 'd' }], line: 2 },
		],
	});
	assert.deepEqual(table.column(0), ['a', 'c']);
	assert.deepEqual(table.column(1), ['b', 'd']);
});

test('rowCount includes header', () => {
	const table = new BrowsecraftDataTable({
		rows: [
			{ cells: [{ value: 'h' }], line: 1 },
			{ cells: [{ value: 'r' }], line: 2 },
		],
	});
	assert.equal(table.rowCount, 2);
});

test('transpose() swaps rows and columns', () => {
	const table = new BrowsecraftDataTable({
		rows: [
			{ cells: [{ value: 'a' }, { value: 'b' }], line: 1 },
			{ cells: [{ value: 'c' }, { value: 'd' }], line: 2 },
		],
	});
	const transposed = table.transpose();
	assert.deepEqual(transposed, [
		['a', 'c'],
		['b', 'd'],
	]);
});

// -----------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------

console.log(`\n  Step Registry & DataTable: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
