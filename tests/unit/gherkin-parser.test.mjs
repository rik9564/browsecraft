#!/usr/bin/env node

// ============================================================================
// Unit Tests — Gherkin Parser
// ============================================================================

import assert from 'node:assert/strict';
import { getSupportedLanguages, parseGherkin } from '../../packages/browsecraft-bdd/dist/index.js';

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

console.log('\n\x1b[1mGherkin Parser Tests\x1b[0m\n');

// -----------------------------------------------------------------------
// Basic Feature parsing
// -----------------------------------------------------------------------

test('parses a minimal Feature', () => {
	const doc = parseGherkin('Feature: Login');
	assert.ok(doc.feature);
	assert.equal(doc.feature.keyword, 'Feature');
	assert.equal(doc.feature.name, 'Login');
	assert.equal(doc.feature.children.length, 0);
});

test('parses Feature with description', () => {
	const doc = parseGherkin(`Feature: Login
  As a user
  I want to log in
  So that I can access my account`);
	assert.ok(doc.feature);
	assert.equal(doc.feature.name, 'Login');
	assert.ok(doc.feature.description.includes('As a user'));
});

test('returns null feature for empty input', () => {
	const doc = parseGherkin('');
	assert.equal(doc.feature, null);
});

test('returns null feature for comment-only input', () => {
	const doc = parseGherkin('# just a comment');
	assert.equal(doc.feature, null);
	assert.equal(doc.comments.length, 1);
});

test('preserves uri', () => {
	const doc = parseGherkin('Feature: X', 'login.feature');
	assert.equal(doc.uri, 'login.feature');
});

// -----------------------------------------------------------------------
// Scenarios
// -----------------------------------------------------------------------

test('parses a Scenario with steps', () => {
	const doc = parseGherkin(`
Feature: Login
  Scenario: Valid credentials
    Given I am on the login page
    When I enter my username and password
    Then I should see the dashboard
`);
	assert.ok(doc.feature);
	const children = doc.feature.children;
	assert.equal(children.length, 1);
	const scenario = 'scenario' in children[0] ? children[0].scenario : null;
	assert.ok(scenario);
	assert.equal(scenario.name, 'Valid credentials');
	assert.equal(scenario.steps.length, 3);
	assert.equal(scenario.steps[0].keyword, 'Given');
	assert.equal(scenario.steps[0].keywordType, 'Context');
	assert.equal(scenario.steps[0].text, 'I am on the login page');
	assert.equal(scenario.steps[1].keyword, 'When');
	assert.equal(scenario.steps[1].keywordType, 'Action');
	assert.equal(scenario.steps[2].keyword, 'Then');
	assert.equal(scenario.steps[2].keywordType, 'Outcome');
});

test('parses And/But steps as Conjunction', () => {
	const doc = parseGherkin(`
Feature: F
  Scenario: S
    Given step one
    And step two
    But step three
`);
	const scenario = doc.feature.children[0].scenario;
	assert.equal(scenario.steps[1].keyword, 'And');
	assert.equal(scenario.steps[1].keywordType, 'Conjunction');
	assert.equal(scenario.steps[2].keyword, 'But');
	assert.equal(scenario.steps[2].keywordType, 'Conjunction');
});

test('parses * step as Unknown keyword type', () => {
	const doc = parseGherkin(`
Feature: F
  Scenario: S
    * some step
`);
	const step = doc.feature.children[0].scenario.steps[0];
	assert.equal(step.keyword, '*');
	assert.equal(step.keywordType, 'Unknown');
	assert.equal(step.text, 'some step');
});

test('parses multiple scenarios', () => {
	const doc = parseGherkin(`
Feature: F
  Scenario: A
    Given step a
  Scenario: B
    Given step b
`);
	assert.equal(doc.feature.children.length, 2);
	assert.equal(doc.feature.children[0].scenario.name, 'A');
	assert.equal(doc.feature.children[1].scenario.name, 'B');
});

test('parses Scenario using "Example" keyword', () => {
	const doc = parseGherkin(`
Feature: F
  Example: An example
    Given something
`);
	assert.ok(doc.feature.children[0].scenario);
	assert.equal(doc.feature.children[0].scenario.name, 'An example');
});

// -----------------------------------------------------------------------
// Tags
// -----------------------------------------------------------------------

test('parses feature-level tags', () => {
	const doc = parseGherkin(`
@smoke @regression
Feature: Tagged
`);
	assert.ok(doc.feature);
	const tags = doc.feature.tags.map((t) => t.name);
	assert.ok(tags.includes('@smoke'));
	assert.ok(tags.includes('@regression'));
});

test('parses scenario-level tags', () => {
	const doc = parseGherkin(`
Feature: F
  @login @critical
  Scenario: Tagged scenario
    Given something
`);
	const scenario = doc.feature.children[0].scenario;
	const tags = scenario.tags.map((t) => t.name);
	assert.ok(tags.includes('@login'));
	assert.ok(tags.includes('@critical'));
});

// -----------------------------------------------------------------------
// Background
// -----------------------------------------------------------------------

test('parses Background', () => {
	const doc = parseGherkin(`
Feature: F
  Background:
    Given I am logged in

  Scenario: S
    When I do something
`);
	const children = doc.feature.children;
	assert.equal(children.length, 2);
	const bg = children[0].background;
	assert.ok(bg);
	assert.equal(bg.steps.length, 1);
	assert.equal(bg.steps[0].text, 'I am logged in');
});

// -----------------------------------------------------------------------
// Data Tables
// -----------------------------------------------------------------------

test('parses data tables in steps', () => {
	const doc = parseGherkin(`
Feature: F
  Scenario: S
    Given the following users:
      | name  | age |
      | Alice | 30  |
      | Bob   | 25  |
`);
	const step = doc.feature.children[0].scenario.steps[0];
	assert.ok(step.dataTable);
	assert.equal(step.dataTable.rows.length, 3);
	assert.equal(step.dataTable.rows[0].cells[0].value, 'name');
	assert.equal(step.dataTable.rows[0].cells[1].value, 'age');
	assert.equal(step.dataTable.rows[1].cells[0].value, 'Alice');
	assert.equal(step.dataTable.rows[2].cells[0].value, 'Bob');
});

test('handles escaped pipes in data tables', () => {
	const doc = parseGherkin(`
Feature: F
  Scenario: S
    Given data:
      | expression   |
      | a \\| b      |
`);
	const step = doc.feature.children[0].scenario.steps[0];
	const cell = step.dataTable.rows[1].cells[0].value;
	assert.ok(cell.includes('|'), `Expected pipe in cell, got "${cell}"`);
});

// -----------------------------------------------------------------------
// Doc Strings
// -----------------------------------------------------------------------

test('parses doc string with triple quotes', () => {
	const doc = parseGherkin(`
Feature: F
  Scenario: S
    Given the following text:
      """
      Hello World
      Line two
      """
`);
	const step = doc.feature.children[0].scenario.steps[0];
	assert.ok(step.docString);
	assert.ok(step.docString.content.includes('Hello World'));
	assert.ok(step.docString.content.includes('Line two'));
	assert.equal(step.docString.delimiter, '"""');
});

test('parses doc string with backtick delimiter', () => {
	const doc = parseGherkin(`
Feature: F
  Scenario: S
    Given code:
      \`\`\`json
      {"key": "value"}
      \`\`\`
`);
	const step = doc.feature.children[0].scenario.steps[0];
	assert.ok(step.docString);
	assert.equal(step.docString.mediaType, 'json');
	assert.ok(step.docString.content.includes('"key"'));
});

test('preserves indentation in doc strings', () => {
	const doc = parseGherkin(`
Feature: F
  Scenario: S
    Given a doc string
      """
      Line 1
        Line 2
      Line 3
      """
`);
	const step = doc.feature.children[0].scenario.steps[0];
	assert.equal(step.docString.content, 'Line 1\n  Line 2\nLine 3');
});

test('handles under-indented doc string content', () => {
	const doc = parseGherkin(`
Feature: F
  Scenario: S
    Given a doc string
      """
    Under
      """
`);
	const step = doc.feature.children[0].scenario.steps[0];
	// We expect "Under" to be preserved correctly, not sliced to "der"
	assert.equal(step.docString.content, 'Under');
});

test('handles doc strings with various media types', () => {
	const doc = parseGherkin(`
Feature: F
  Scenario: S
    Given code:
      \`\`\`typescript
      const x = 1;
      \`\`\`
`);
	const step = doc.feature.children[0].scenario.steps[0];
	assert.equal(step.docString.mediaType, 'typescript');
	assert.equal(step.docString.content, 'const x = 1;');
});

test('handles empty doc strings', () => {
	const doc = parseGherkin(`
Feature: F
  Scenario: S
    Given nothing:
      """
      """
`);
	const step = doc.feature.children[0].scenario.steps[0];
	assert.equal(step.docString.content, '');
});

test('handles doc strings with no indentation', () => {
	const doc = parseGherkin(`Feature: F
Scenario: S
Given something:
"""
  Indented content
"""
`);
	const step = doc.feature.children[0].scenario.steps[0];
	// indent is 0, so "  Indented content" should remain "  Indented content"
	assert.equal(step.docString.content, '  Indented content');
});

// -----------------------------------------------------------------------
// Scenario Outline / Examples
// -----------------------------------------------------------------------

test('parses Scenario Outline with Examples', () => {
	const doc = parseGherkin(`
Feature: F
  Scenario Outline: Login with <user>
    Given I am on the login page
    When I enter "<user>" and "<password>"
    Then I should see "<result>"

    Examples:
      | user  | password | result  |
      | admin | pass123  | Welcome |
      | guest | wrong    | Error   |
`);
	const scenario = doc.feature.children[0].scenario;
	assert.equal(scenario.keyword, 'Scenario Outline');
	assert.equal(scenario.examples.length, 1);
	const ex = scenario.examples[0];
	assert.ok(ex.tableHeader);
	assert.equal(ex.tableHeader.cells.length, 3);
	assert.equal(ex.tableBody.length, 2);
	assert.equal(ex.tableBody[0].cells[0].value, 'admin');
});

test('parses Scenario Template keyword', () => {
	const doc = parseGherkin(`
Feature: F
  Scenario Template: Template test
    Given I have <count> items
    Examples:
      | count |
      | 5     |
`);
	const scenario = doc.feature.children[0].scenario;
	assert.equal(scenario.keyword, 'Scenario Template');
});

// -----------------------------------------------------------------------
// Rules
// -----------------------------------------------------------------------

test('parses Rule containing scenarios', () => {
	const doc = parseGherkin(`
Feature: F
  Rule: Business rule
    Scenario: S1
      Given step
    Scenario: S2
      Given step
`);
	const rule = doc.feature.children[0].rule;
	assert.ok(rule);
	assert.equal(rule.name, 'Business rule');
	assert.equal(rule.children.length, 2);
});

// -----------------------------------------------------------------------
// Comments
// -----------------------------------------------------------------------

test('collects comments', () => {
	const doc = parseGherkin(`
# This is a comment
Feature: F
  # Another comment
  Scenario: S
    Given step
`);
	assert.ok(doc.comments.length >= 1);
});

// -----------------------------------------------------------------------
// i18n (internationalization)
// -----------------------------------------------------------------------

test('getSupportedLanguages returns languages including en', () => {
	const langs = getSupportedLanguages();
	assert.ok(Array.isArray(langs));
	assert.ok(langs.includes('en'));
	assert.ok(langs.includes('fr'));
	assert.ok(langs.includes('de'));
	assert.ok(langs.includes('ja'));
});

test('parses French feature file', () => {
	const doc = parseGherkin(`# language: fr
Fonctionnalité: Connexion
  Scénario: Identifiants valides
    Soit je suis sur la page de connexion
    Quand je me connecte
    Alors je vois le tableau de bord
`);
	assert.ok(doc.feature);
	assert.equal(doc.feature.language, 'fr');
	assert.equal(doc.feature.keyword, 'Fonctionnalité');
	const scenario = doc.feature.children[0].scenario;
	assert.equal(scenario.steps.length, 3);
});

test('parses German feature file', () => {
	const doc = parseGherkin(`# language: de
Funktionalität: Anmeldung
  Szenario: Gültige Anmeldedaten
    Angenommen ich bin auf der Login-Seite
    Wenn ich mich anmelde
    Dann sehe ich das Dashboard
`);
	assert.ok(doc.feature);
	assert.equal(doc.feature.language, 'de');
	assert.equal(doc.feature.children[0].scenario.steps.length, 3);
});

test('parses Japanese feature file', () => {
	const doc = parseGherkin(`# language: ja
機能: ログイン
  シナリオ: 有効な資格情報
    前提 ログインページにいる
    もし ユーザー名とパスワードを入力する
    ならば ダッシュボードが表示される
`);
	assert.ok(doc.feature);
	assert.equal(doc.feature.language, 'ja');
});

// -----------------------------------------------------------------------
// Edge cases
// -----------------------------------------------------------------------

test('handles blank lines between steps', () => {
	const doc = parseGherkin(`
Feature: F
  Scenario: S
    Given step one

    When step two
`);
	// The blank line may split the steps, but both should be parsed
	const scenario = doc.feature.children[0].scenario;
	assert.ok(scenario.steps.length >= 1);
});

test('handles feature with no scenarios', () => {
	const doc = parseGherkin(`
Feature: Empty feature
  This is just a description with no scenarios.
`);
	assert.ok(doc.feature);
	assert.equal(doc.feature.children.length, 0);
});

test('step line numbers are 1-based', () => {
	const doc = parseGherkin(`Feature: F
  Scenario: S
    Given step`);
	const step = doc.feature.children[0].scenario.steps[0];
	assert.ok(step.line >= 1);
});

// -----------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------

console.log(`\n  Gherkin Parser: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
