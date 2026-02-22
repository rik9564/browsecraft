// ============================================================================
// Browsecraft AI
// AI-powered features for self-healing selectors, test generation,
// and visual regression. Uses GitHub Models API for LLM tasks (free with PAT).
//
// Key principle: Everything works perfectly without AI.
// AI features are opt-in and gracefully degrade when no GitHub token is set.
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
export { healSelector, type HealResult, type PageSnapshot } from './self-healing.js';
export { generateTest, type GenerateTestOptions, type GeneratedTest } from './test-gen.js';
export {
	compareScreenshots,
	type VisualDiffResult,
	type VisualDiffOptions,
} from './visual-diff.js';
