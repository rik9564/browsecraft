// ============================================================================
// Browsecraft Runner - Types
// ============================================================================

/** Configuration shape (mirrors browsecraft's BrowsecraftConfig) */
export interface BrowsecraftConfig {
	browser: 'chrome' | 'firefox' | 'edge';
	headless: boolean;
	timeout: number;
	retries: number;
	screenshot: 'always' | 'on-failure' | 'never';
	baseURL: string;
	executablePath?: string;
	viewport: { width: number; height: number };
	/** Start the browser window maximized (headed mode only, default: false) */
	maximized: boolean;
	workers: number;
	testMatch: string;
	outputDir: string;
	ai: 'auto' | 'off' | { provider: 'github-models'; model?: string; token?: string };
	debug: boolean;
}

/** Options for the test runner */
export interface RunnerOptions {
	/** Resolved config */
	config: BrowsecraftConfig;
	/** Specific files to run (overrides testMatch) */
	files?: string[];
	/** Filter tests by name pattern */
	grep?: string;
	/** Stop after first failure */
	bail?: boolean;
}

/** Result of a single test execution */
export interface TestResult {
	title: string;
	suitePath: string[];
	status: 'passed' | 'failed' | 'skipped';
	duration: number;
	error?: Error;
	retries?: number;
}

/** Summary of a full test run */
export interface RunSummary {
	total: number;
	passed: number;
	failed: number;
	skipped: number;
	duration: number;
	results: TestResult[];
}
