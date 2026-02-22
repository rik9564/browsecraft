// ============================================================================
// Browsecraft - Public API
// Everything you need to write browser tests. Nothing you don't.
//
// import { test, expect, defineConfig } from 'browsecraft';
//
// test('example', async ({ page }) => {
//   await page.goto('https://example.com');
//   await page.click('More information');
//   await expect(page).toHaveURL(/iana/);
// });
// ============================================================================

// Core test API
export {
	test,
	describe,
	beforeAll,
	afterAll,
	beforeEach,
	afterEach,
	testRegistry,
	runTest,
	runAfterAllHooks,
	resetTestState,
} from './test.js';
export type { TestFixtures, TestCase, TestOptions, TestResult } from './test.js';

// Assertions
export { expect, AssertionError } from './expect.js';

// Configuration
export { defineConfig, resolveConfig } from './config.js';
export type { BrowsecraftConfig, UserConfig, AIConfig } from './config.js';

// Browser & Page (for advanced usage / scripting)
export { Browser, BrowserContext } from './browser.js';
export { Page, ElementHandle } from './page.js';
export type { GotoOptions, ClickOptions, FillOptions, MockResponse } from './page.js';

// Re-export cookie types for convenience
export type { StorageCookie } from 'browsecraft-bidi';

// Locator types (for advanced usage)
export type { ElementTarget, LocatorOptions } from './locator.js';

// ---------------------------------------------------------------------------
// BDD — Built-in Behavior-Driven Development
// ---------------------------------------------------------------------------

// Gherkin parser
export { parseGherkin, getSupportedLanguages } from 'browsecraft-bdd';
export type {
	GherkinDocument,
	Feature as GherkinFeature,
	Scenario as GherkinScenario,
} from 'browsecraft-bdd';

// Step definitions (Mode 1: Classic Gherkin)
export {
	Given,
	When,
	Then,
	Step,
	defineParameterType,
	BrowsecraftDataTable,
	globalRegistry,
} from 'browsecraft-bdd';
export type { StepWorld, StepFunction, StepDefinition, StepMatch } from 'browsecraft-bdd';

// Executor
export { BddExecutor, createExecutor, pending } from 'browsecraft-bdd';
export type {
	ExecutorOptions,
	RunResult,
	FeatureResult,
	ScenarioResult,
	StepResult,
	StepStatus,
} from 'browsecraft-bdd';

// Hooks
export {
	Before,
	After,
	BeforeAll as BddBeforeAll,
	AfterAll as BddAfterAll,
	BeforeFeature,
	AfterFeature,
	BeforeStep,
	AfterStep,
} from 'browsecraft-bdd';

// Tags
export { parseTagExpression, matchesTags } from 'browsecraft-bdd';

// TypeScript-native BDD (Mode 2)
export {
	feature,
	scenario,
	given,
	when,
	then,
	and,
	but,
	runFeatures,
	clearFeatures,
} from 'browsecraft-bdd';
export type { ScenarioContext, TsBddOptions } from 'browsecraft-bdd';

// AI auto-step generation (Mode 3)
export { autoGenerateSteps, autoGenerateStepsFromDocument } from 'browsecraft-bdd';
export type { AutoStepResult, AutoStepOptions, GeneratedStepDef } from 'browsecraft-bdd';
