// ============================================================================
// Browsecraft AI
// AI-powered features for self-healing selectors, test generation,
// and visual regression. Uses Ollama for LLM tasks (all free/local).
//
// Key principle: Everything works perfectly without AI.
// AI features are opt-in and gracefully degrade when Ollama is not running.
// ============================================================================

export { isOllamaAvailable, detectCapabilities, type AICapabilities } from './ollama.js';
export { healSelector, type HealResult, type PageSnapshot } from './self-healing.js';
export { generateTest, type GenerateTestOptions, type GeneratedTest } from './test-gen.js';
export { compareScreenshots, type VisualDiffResult, type VisualDiffOptions } from './visual-diff.js';
