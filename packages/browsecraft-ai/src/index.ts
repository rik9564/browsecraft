// ============================================================================
// Browsecraft AI
// AI-powered features for self-healing selectors, test generation,
// visual regression, and multi-provider LLM support.
//
// Supported providers: GitHub Models (free), OpenAI, Anthropic, Ollama.
//
// Key principle: Everything works perfectly without AI.
// AI features are opt-in and gracefully degrade when no token is set.
// ============================================================================

export {
	isGitHubModelsAvailable,
	detectCapabilities,
	githubModelsChat,
	githubModelsGenerate,
	resolveToken,
	type AICapabilities,
	type ChatMessage,
} from './github-models.js';
export {
	providerChat,
	isProviderAvailable,
	getDefaultModel,
	getProviderLabel,
	type ProviderName,
	type ProviderConfig,
	type ChatOptions,
} from './providers.js';
export { healSelector, type HealResult, type PageSnapshot } from './self-healing.js';
export { generateTest, type GenerateTestOptions, type GeneratedTest } from './test-gen.js';
export {
	compareScreenshots,
	type VisualDiffResult,
	type VisualDiffOptions,
} from './visual-diff.js';
export {
	diagnoseFailure,
	type DiagnosisContext,
	type Diagnosis,
} from './diagnose.js';
