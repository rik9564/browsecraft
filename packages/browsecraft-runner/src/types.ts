// ============================================================================
// Browsecraft Runner - Types
// ============================================================================

/** Configuration shape (mirrors browsecraft's BrowsecraftConfig) */
export interface BrowsecraftConfig {
	browser: 'chrome' | 'firefox' | 'edge';
	/** Run across multiple browsers simultaneously */
	browsers?: Array<'chrome' | 'firefox' | 'edge'>;
	headless: boolean;
	timeout: number;
	retries: number;
	screenshot: 'always' | 'on-failure' | 'never';
	baseURL: string;
	executablePath?: string;
	viewport: { width: number; height: number };
	/** Start the browser window maximized (headed mode only, default: false) */
	maximized: boolean;
	/** Workers per browser */
	workers: number;
	/** Execution strategy: 'parallel' | 'sequential' | 'matrix' */
	strategy: 'parallel' | 'sequential' | 'matrix';
	testMatch: string;
	outputDir: string;
	ai:
		| 'auto'
		| 'off'
		| { provider: string; model?: string; token?: string; apiKey?: string; baseUrl?: string };
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
