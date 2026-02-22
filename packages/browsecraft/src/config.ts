// ============================================================================
// Browsecraft - Configuration
// Zero config by default. Override only what you need.
// ============================================================================

import { cpus } from 'node:os';
import type { BrowserName } from 'browsecraft-bidi';

/** Full configuration with all options */
export interface BrowsecraftConfig {
	/** Which browser to use (default: 'chrome') */
	browser: BrowserName;
	/** Run in headless mode (default: true) */
	headless: boolean;
	/** Global timeout for actions in ms (default: 30000) */
	timeout: number;
	/** How many times to retry a failed test (default: 0) */
	retries: number;
	/** Take screenshots: 'always', 'on-failure', or 'never' (default: 'on-failure') */
	screenshot: 'always' | 'on-failure' | 'never';
	/** Base URL prepended to all page.goto() calls (default: '') */
	baseURL: string;
	/** Custom browser executable path */
	executablePath?: string;
	/** Viewport size (default: 1280x720) */
	viewport: { width: number; height: number };
	/** Start the browser window maximized (headed mode only, default: false) */
	maximized: boolean;
	/** Number of parallel workers (default: CPU cores / 2) */
	workers: number;
	/** Test file pattern (default: '**\/*.test.{ts,js,mts,mjs}') */
	testMatch: string;
	/** Output directory for reports/screenshots (default: '.browsecraft') */
	outputDir: string;
	/** AI mode: 'auto' detects GitHub Models availability, 'off' disables (default: 'auto') */
	ai: 'auto' | 'off' | AIConfig;
	/** Enable verbose debug logging (default: false) */
	debug: boolean;
	/** BDD configuration for Gherkin feature files */
	bdd?: BddConfig;
}

/** Configuration for BDD (Gherkin) test execution */
export interface BddConfig {
	// Glob pattern for feature files (default: 'features/**\/*.feature')
	features?: string;
	// Glob pattern for step definition files (default: 'steps/**\/*.{ts,js,mts,mjs}')
	steps?: string;
	/** Whether to register the 38 built-in step definitions (default: true) */
	builtInSteps?: boolean;
}

export interface AIConfig {
	provider: 'github-models';
	/** Model to use (default: 'openai/gpt-4o-mini') */
	model?: string;
	/** Explicit GitHub token (overrides env vars) */
	token?: string;
}

/** Users provide a partial config -- everything has smart defaults */
export type UserConfig = Partial<BrowsecraftConfig>;

/** Smart defaults -- works out of the box with zero config */
const DEFAULTS: BrowsecraftConfig = {
	browser: 'chrome',
	headless: true,
	timeout: 30_000,
	retries: 0,
	screenshot: 'on-failure',
	baseURL: '',
	viewport: { width: 1280, height: 720 },
	maximized: false,
	workers: Math.max(1, Math.floor((typeof cpus === 'function' ? cpus().length : 4) / 2)),
	testMatch: '**/*.test.{ts,js,mts,mjs}',
	outputDir: '.browsecraft',
	ai: 'auto',
	debug: false,
};

/**
 * Define your Browsecraft config with full type safety and IntelliSense.
 * This function is optional -- it's just a type helper for your IDE.
 *
 * ```ts
 * // browsecraft.config.ts
 * import { defineConfig } from 'browsecraft';
 *
 * export default defineConfig({
 *   browser: 'firefox',
 *   timeout: 60_000,
 * });
 * ```
 */
export function defineConfig(config: UserConfig): UserConfig {
	return config;
}

/**
 * Resolve user config by merging with defaults.
 * This is used internally -- users never call this.
 */
export function resolveConfig(userConfig?: UserConfig): BrowsecraftConfig {
	if (!userConfig) return { ...DEFAULTS };

	return {
		...DEFAULTS,
		...userConfig,
		viewport: userConfig.viewport ?? DEFAULTS.viewport,
	};
}
