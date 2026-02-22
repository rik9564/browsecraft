// ============================================================================
// Browsecraft - Configuration
// Zero config by default. Override only what you need.
// ============================================================================

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
	/** Number of parallel workers (default: CPU cores / 2) */
	workers: number;
	/** Test file pattern (default: '**\/*.test.{ts,js,mts,mjs}') */
	testMatch: string;
	/** Output directory for reports/screenshots (default: '.browsecraft') */
	outputDir: string;
	/** AI mode: 'auto' detects Ollama, 'off' disables (default: 'auto') */
	ai: 'auto' | 'off' | AIConfig;
	/** Enable verbose debug logging (default: false) */
	debug: boolean;
}

export interface AIConfig {
	provider: 'ollama';
	model?: string;
	endpoint?: string;
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
	workers: Math.max(1, Math.floor((globalThis?.navigator?.hardwareConcurrency ?? 4) / 2)),
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
