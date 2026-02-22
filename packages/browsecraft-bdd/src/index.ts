// ============================================================================
// Browsecraft BDD — Built-in Behavior-Driven Development framework.
//
// Three modes:
//   1. Classic Gherkin: .feature files + step definitions
//   2. TypeScript-native BDD: feature(), scenario(), given(), when(), then()
//   3. AI-assisted: Write .feature only, AI generates step definitions
//
// Zero external dependencies. Everything built from scratch.
// ============================================================================

// ---------------------------------------------------------------------------
// Gherkin Parser
// ---------------------------------------------------------------------------
export {
	parseGherkin,
	getSupportedLanguages,
	type GherkinDocument,
	type Feature,
	type Scenario,
	type Step as GherkinStep,
	type Background,
	type Rule,
	type Examples,
	type DataTable,
	type DocString,
	type TableRow,
	type TableCell,
	type Tag,
	type Comment,
	type FeatureChild,
	type RuleChild,
	type StepKeywordType,
} from './gherkin-parser.js';

// ---------------------------------------------------------------------------
// Step Registry
// ---------------------------------------------------------------------------
export {
	StepRegistry,
	BrowsecraftDataTable,
	globalRegistry,
	Given,
	When,
	Then,
	Step,
	defineParameterType,
	type StepWorld,
	type StepFunction,
	type StepDefinition,
	type StepMatch,
	type StepType,
} from './step-registry.js';

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------
export {
	parseTagExpression,
	evaluateTagExpression,
	matchesTags,
	tagsMatch,
	type TagExpression,
} from './tags.js';

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------
export {
	HookRegistry,
	globalHookRegistry,
	Before,
	After,
	BeforeAll,
	AfterAll,
	BeforeFeature,
	AfterFeature,
	BeforeStep,
	AfterStep,
	type HookScope,
	type HookContext,
	type HookFunction,
	type HookDefinition,
} from './hooks.js';

// ---------------------------------------------------------------------------
// Executor (Mode 1: Classic Gherkin)
// ---------------------------------------------------------------------------
export {
	BddExecutor,
	createExecutor,
	pending,
	type ExecutorOptions,
	type RunResult,
	type FeatureResult,
	type ScenarioResult,
	type StepResult,
	type StepStatus,
	type Attachment,
} from './executor.js';

// ---------------------------------------------------------------------------
// TypeScript-Native BDD (Mode 2)
// ---------------------------------------------------------------------------
export {
	feature,
	scenario,
	given,
	when,
	then,
	and,
	but,
	beforeEach,
	afterEach,
	runFeatures,
	clearFeatures,
	getCollectedFeatureCount,
	type ScenarioContext,
	type TsBddOptions,
} from './ts-bdd.js';

// ---------------------------------------------------------------------------
// AI Auto-Step Generation (Mode 3)
// ---------------------------------------------------------------------------
export {
	autoGenerateSteps,
	autoGenerateStepsFromDocument,
	type AutoStepResult,
	type AutoStepOptions,
	type GeneratedStepDef,
} from './ai-steps.js';
