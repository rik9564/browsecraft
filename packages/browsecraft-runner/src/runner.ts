// ============================================================================
// Browsecraft Runner - Test Runner
// Discovers test files, loads them, executes tests, reports results.
//
// The runner does NOT import 'browsecraft' to avoid circular deps.
// Test execution is delegated via callbacks provided by the CLI.
// ============================================================================

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { RunSummary, RunnerOptions, TestResult } from './types.js';

/** A test case as passed to the runner from the browsecraft package */
export interface RunnableTest {
	title: string;
	suitePath: string[];
	skip: boolean;
	only: boolean;
	options: { timeout?: number; retries?: number; tags?: string[] };
	fn: (fixtures: unknown) => Promise<void>;
}

/** Callback that the CLI provides to execute a single test */
export type TestExecutor = (test: RunnableTest) => Promise<TestResult>;

/**
 * TestRunner discovers test files, loads them, and coordinates execution.
 *
 * Used by the CLI:
 * ```ts
 * const runner = new TestRunner({ config });
 * const exitCode = await runner.run(getTests, executeTest);
 * ```
 */
export class TestRunner {
	private options: RunnerOptions;

	constructor(options: RunnerOptions) {
		this.options = options;
	}

	/**
	 * Run all tests and return an exit code (0 = success, 1 = failure).
	 *
	 * @param loadFile - Load a test file (triggers test registration). Returns registered tests.
	 * @param executeTest - Execute a single test and return its result.
	 */
	async run(
		loadFile: (file: string) => Promise<RunnableTest[]>,
		executeTest: TestExecutor,
	): Promise<number> {
		const startTime = Date.now();

		// Step 1: Discover test files
		const files = this.discoverFiles();
		if (files.length === 0) {
			console.log('\n  No test files found.\n');
			console.log(`  Test pattern: ${this.options.config.testMatch}`);
			console.log('  Run "browsecraft init" to create an example test.\n');
			return 0;
		}

		console.log(
			`\n  Browsecraft - Running ${files.length} test file${files.length > 1 ? 's' : ''}\n`,
		);

		// Step 2: Load and run each test file
		const allResults: TestResult[] = [];
		let bail = false;

		for (const file of files) {
			if (bail) break;

			const relPath = relative(process.cwd(), file);
			console.log(`  ${relPath}`);

			try {
				const tests = await loadFile(file);

				// Apply grep filter
				const filteredTests = this.options.grep
					? tests.filter((t) => t.title.includes(this.options.grep!))
					: tests;

				// Check for .only tests
				const hasOnly = filteredTests.some((t) => t.only);
				const testsToRun = hasOnly ? filteredTests.filter((t) => t.only) : filteredTests;

				// Run each test
				for (const test of testsToRun) {
					let result = await executeTest(test);

					// Handle retries
					const maxRetries = test.options.retries ?? this.options.config.retries;
					let retryCount = 0;

					while (result.status === 'failed' && retryCount < maxRetries) {
						retryCount++;
						result = await executeTest(test);
					}

					if (retryCount > 0) {
						result.retries = retryCount;
					}

					allResults.push(result);

					// Print result
					const prefix = this.getStatusIcon(result.status);
					const suiteName = result.suitePath.length > 0 ? `${result.suitePath.join(' > ')} > ` : '';
					const duration = result.status !== 'skipped' ? ` (${result.duration}ms)` : '';

					console.log(`    ${prefix} ${suiteName}${result.title}${duration}`);

					if (result.status === 'failed' && result.error) {
						console.log(`      ${result.error.message}`);
					}
				}
			} catch (error) {
				const errorResult: TestResult = {
					title: `Failed to load: ${relPath}`,
					suitePath: [],
					status: 'failed',
					duration: 0,
					error: error instanceof Error ? error : new Error(String(error)),
				};
				allResults.push(errorResult);
				console.log(`    ${this.getStatusIcon('failed')} ${errorResult.title}`);
				console.log(`      ${errorResult.error?.message}`);
			}

			console.log('');

			// Check bail
			if (this.options.bail && allResults.some((r) => r.status === 'failed')) {
				bail = true;
			}
		}

		// Step 3: Print summary
		const summary = this.summarize(allResults, Date.now() - startTime);
		this.printSummary(summary);

		return summary.failed > 0 ? 1 : 0;
	}

	// -----------------------------------------------------------------------
	// File Discovery
	// -----------------------------------------------------------------------

	discoverFiles(): string[] {
		// If specific files are provided, use those
		if (this.options.files && this.options.files.length > 0) {
			return this.options.files.map((f) => resolve(process.cwd(), f)).filter((f) => existsSync(f));
		}

		// Otherwise, find files matching the test pattern
		const cwd = process.cwd();
		return this.findTestFiles(cwd);
	}

	/**
	 * Find test files matching the configured pattern.
	 */
	private findTestFiles(dir: string): string[] {
		const files: string[] = [];
		const pattern = this.options.config.testMatch;

		// Extract extensions from pattern like '*.test.{ts,js,mts,mjs}'
		const extMatch = pattern.match(/\.\{([^}]+)\}$/);
		const extensions = extMatch
			? (extMatch[1]?.split(',').map((e) => e.trim()) ?? ['ts', 'js'])
			: ['ts', 'js'];

		// Extract the suffix part (e.g., '.test')
		const suffixMatch = pattern.match(/\*(\.[^{*]+)\./);
		const suffix = suffixMatch ? suffixMatch[1]! : '.test';

		this.walkDir(dir, files, extensions, suffix);
		return files.sort();
	}

	private walkDir(dir: string, results: string[], extensions: string[], suffix: string): void {
		const skip = new Set(['node_modules', 'dist', '.browsecraft', '.git', 'coverage', '.turbo']);

		let entries: string[];
		try {
			entries = readdirSync(dir);
		} catch {
			return;
		}

		for (const entry of entries) {
			if (skip.has(entry)) continue;

			const fullPath = join(dir, entry);
			let stat: ReturnType<typeof statSync>;

			try {
				stat = statSync(fullPath);
			} catch {
				continue;
			}

			if (stat.isDirectory()) {
				this.walkDir(fullPath, results, extensions, suffix);
			} else if (stat.isFile()) {
				// Check if file matches pattern like "foo.test.ts"
				const matchesPattern = extensions.some((ext) => entry.endsWith(`${suffix}.${ext}`));
				if (matchesPattern) {
					results.push(fullPath);
				}
			}
		}
	}

	// -----------------------------------------------------------------------
	// Reporting
	// -----------------------------------------------------------------------

	private getStatusIcon(status: string): string {
		switch (status) {
			case 'passed':
				return '\x1b[32m+\x1b[0m';
			case 'failed':
				return '\x1b[31mx\x1b[0m';
			case 'skipped':
				return '\x1b[33m-\x1b[0m';
			default:
				return ' ';
		}
	}

	private summarize(results: TestResult[], totalDuration: number): RunSummary {
		return {
			total: results.length,
			passed: results.filter((r) => r.status === 'passed').length,
			failed: results.filter((r) => r.status === 'failed').length,
			skipped: results.filter((r) => r.status === 'skipped').length,
			duration: totalDuration,
			results,
		};
	}

	private printSummary(summary: RunSummary): void {
		const { total, passed, failed, skipped, duration } = summary;

		console.log('  ─────────────────────────────────────');

		const parts: string[] = [];
		if (passed > 0) parts.push(`\x1b[32m${passed} passed\x1b[0m`);
		if (failed > 0) parts.push(`\x1b[31m${failed} failed\x1b[0m`);
		if (skipped > 0) parts.push(`\x1b[33m${skipped} skipped\x1b[0m`);

		console.log(`  Tests: ${parts.join(', ')} (${total} total)`);
		console.log(`  Time:  ${this.formatDuration(duration)}`);
		console.log('');

		if (failed > 0) {
			console.log('  \x1b[31mSome tests failed.\x1b[0m\n');
		} else if (total === 0) {
			console.log('  No tests were run.\n');
		} else {
			console.log('  \x1b[32mAll tests passed!\x1b[0m\n');
		}
	}

	private formatDuration(ms: number): string {
		if (ms < 1000) return `${ms}ms`;
		if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
		const minutes = Math.floor(ms / 60_000);
		const seconds = ((ms % 60_000) / 1000).toFixed(1);
		return `${minutes}m ${seconds}s`;
	}
}
