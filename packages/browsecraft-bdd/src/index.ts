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
	computeSummary,
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
// NOTE: `then` is renamed to `thenStep` in the re-export to avoid Node.js
// treating this module as a thenable (modules with a `then` export cause
// dynamic import() to call `then()` as if it were a Promise).
// The internal function remains named `then` in ts-bdd.ts.
// ---------------------------------------------------------------------------
export {
	feature,
	scenario,
	given,
	when,
	then as thenStep,
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
// Built-in Step Definitions
// ---------------------------------------------------------------------------
export { registerBuiltInSteps, getBuiltInStepPatterns } from './built-in-steps.js';

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

// ---------------------------------------------------------------------------
// AI Runtime Step Executor (Mode 4: Zero-maintenance AI execution)
// ---------------------------------------------------------------------------
export {
	AIStepExecutor,
	createAIStepExecutor,
	createAIStepExecutorFromConfig,
	type AIStepExecutorConfig,
	type AIStepResult,
	type ActionPlan,
	type PageAction,
	type SimpleAIConfig,
} from './ai-step-executor.js';
