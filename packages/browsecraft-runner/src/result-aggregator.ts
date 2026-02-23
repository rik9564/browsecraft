// ============================================================================
// Browsecraft Runner — Result Aggregator
// Collects, groups, and formats execution results across the browser matrix.
//
// Produces:
// - Per-browser breakdown with pass/fail/skip counts
// - Scenario × Browser matrix for cross-browser reports
// - Timing statistics (min, max, avg, p95 per scenario)
// - Flaky test detection (passed after retries)
// - Summary suitable for CLI console, JSON, or HTML reporters
// ============================================================================

import type { BrowserName, WorkItemResult } from './event-bus.js';

import type { SchedulerResult } from './scheduler.js';

// ---------------------------------------------------------------------------
// Matrix types
// ---------------------------------------------------------------------------

/** Result for one scenario across all browsers */
export interface ScenarioMatrixRow {
	/** Scenario/test ID */
	id: string;
	/** Scenario/test title */
	title: string;
	/** Source file */
	file: string;
	/** Suite/feature path */
	suitePath: string[];
	/** Status per browser */
	browsers: Map<BrowserName, MatrixCell>;
	/** True if status differs across browsers */
	crossBrowserInconsistent: boolean;
	/** True if passed after retries on any browser */
	flaky: boolean;
}

/** Single cell in the matrix: one scenario on one browser */
export interface MatrixCell {
	status: 'passed' | 'failed' | 'skipped' | 'not-run';
	duration: number;
	error?: Error;
	retries?: number;
}

// ---------------------------------------------------------------------------
// Timing statistics
// ---------------------------------------------------------------------------

export interface TimingStats {
	min: number;
	max: number;
	avg: number;
	median: number;
	p95: number;
	total: number;
}

// ---------------------------------------------------------------------------
// Aggregated summary
// ---------------------------------------------------------------------------

export interface AggregatedSummary {
	/** Scenario × browser matrix */
	matrix: ScenarioMatrixRow[];

	/** Per-browser totals */
	browserSummaries: Array<{
		browser: BrowserName;
		passed: number;
		failed: number;
		skipped: number;
		duration: number;
	}>;

	/** Grand totals */
	totals: {
		scenarios: number;
		passed: number;
		failed: number;
		skipped: number;
		flaky: number;
		crossBrowserInconsistent: number;
	};

	/** Timing statistics */
	timing: TimingStats;

	/** Execution strategy used */
	strategy: string;

	/** Total wall-clock time */
	totalDuration: number;

	/** Which browsers were used */
	browsers: BrowserName[];

	/** Lists of notable tests */
	flakyTests: string[];
	inconsistentTests: string[];
	slowestTests: Array<{ title: string; duration: number; browser: BrowserName }>;
	failedTests: Array<{ title: string; error?: string; browser: BrowserName }>;
}

// ---------------------------------------------------------------------------
// ResultAggregator
// ---------------------------------------------------------------------------

/**
 * Transforms raw SchedulerResult into rich, reportable summaries.
 *
 * ```ts
 * const aggregator = new ResultAggregator();
 * const summary = aggregator.aggregate(schedulerResult);
 *
 * console.log(`${summary.totals.passed} passed across ${summary.browsers.length} browsers`);
 * console.log(`Flaky: ${summary.flakyTests.length}`);
 * console.log(`Inconsistent across browsers: ${summary.inconsistentTests.length}`);
 * ```
 */
export class ResultAggregator {
	/**
	 * Aggregate a SchedulerResult into a complete summary.
	 */
	aggregate(result: SchedulerResult): AggregatedSummary {
		const { allResults, browsers: browserResults, strategy, totalDuration } = result;

		// Build matrix
		const matrix = this.buildMatrix(
			allResults,
			browserResults.map((b) => b.browser),
		);

		// Browser summaries
		const browserSummaries = browserResults.map((b) => ({
			browser: b.browser,
			passed: b.passed,
			failed: b.failed,
			skipped: b.skipped,
			duration: b.duration,
		}));

		// Totals
		const uniqueScenarios = new Set(allResults.map((r) => r.item.id));
		const flaky = matrix.filter((r) => r.flaky);
		const inconsistent = matrix.filter((r) => r.crossBrowserInconsistent);

		const totals = {
			scenarios: uniqueScenarios.size,
			passed: result.totalPassed,
			failed: result.totalFailed,
			skipped: result.totalSkipped,
			flaky: flaky.length,
			crossBrowserInconsistent: inconsistent.length,
		};

		// Timing
		const allDurations = allResults.filter((r) => r.status !== 'skipped').map((r) => r.duration);
		const timing = this.computeTimingStats(allDurations);

		// Notable tests
		const flakyTests = flaky.map((r) => r.title);
		const inconsistentTests = inconsistent.map((r) => r.title);

		const slowestTests = [...allResults]
			.filter((r) => r.status !== 'skipped')
			.sort((a, b) => b.duration - a.duration)
			.slice(0, 5)
			.map((r) => ({
				title: r.item.title,
				duration: r.duration,
				browser: r.worker.browser,
			}));

		const failedTests = allResults
			.filter((r) => r.status === 'failed')
			.map((r) => ({
				title: r.item.title,
				error: r.error?.message,
				browser: r.worker.browser,
			}));

		return {
			matrix,
			browserSummaries,
			totals,
			timing,
			strategy,
			totalDuration,
			browsers: browserResults.map((b) => b.browser),
			flakyTests,
			inconsistentTests,
			slowestTests,
			failedTests,
		};
	}

	// -----------------------------------------------------------------------
	// Matrix building
	// -----------------------------------------------------------------------

	/**
	 * Build the scenario × browser matrix.
	 */
	private buildMatrix(results: WorkItemResult[], browsers: BrowserName[]): ScenarioMatrixRow[] {
		// Group results by item ID
		const byId = new Map<string, WorkItemResult[]>();
		for (const result of results) {
			const existing = byId.get(result.item.id) ?? [];
			existing.push(result);
			byId.set(result.item.id, existing);
		}

		const rows: ScenarioMatrixRow[] = [];

		for (const [id, itemResults] of byId) {
			const firstResult = itemResults[0]!;
			const browserMap = new Map<BrowserName, MatrixCell>();

			// Fill in results per browser
			for (const browser of browsers) {
				const browserResult = itemResults.find((r) => r.worker.browser === browser);
				if (browserResult) {
					browserMap.set(browser, {
						status: browserResult.status,
						duration: browserResult.duration,
						error: browserResult.error,
						retries: browserResult.retries,
					});
				} else {
					browserMap.set(browser, {
						status: 'not-run',
						duration: 0,
					});
				}
			}

			// Check cross-browser consistency
			const statuses = new Set(
				[...browserMap.values()].filter((c) => c.status !== 'not-run').map((c) => c.status),
			);
			const crossBrowserInconsistent = statuses.size > 1;

			// Check for flaky tests (passed after retries)
			const flaky = itemResults.some(
				(r) => r.retries !== undefined && r.retries > 0 && r.status === 'passed',
			);

			rows.push({
				id,
				title: firstResult.item.title,
				file: firstResult.item.file,
				suitePath: firstResult.item.suitePath,
				browsers: browserMap,
				crossBrowserInconsistent,
				flaky,
			});
		}

		return rows;
	}

	// -----------------------------------------------------------------------
	// Timing statistics
	// -----------------------------------------------------------------------

	/**
	 * Compute timing statistics from an array of durations.
	 */
	private computeTimingStats(durations: number[]): TimingStats {
		if (durations.length === 0) {
			return { min: 0, max: 0, avg: 0, median: 0, p95: 0, total: 0 };
		}

		const sorted = [...durations].sort((a, b) => a - b);
		const total = sorted.reduce((sum, d) => sum + d, 0);

		return {
			min: sorted[0]!,
			max: sorted[sorted.length - 1]!,
			avg: Math.round(total / sorted.length),
			median: sorted[Math.floor(sorted.length / 2)]!,
			p95: sorted[Math.floor(sorted.length * 0.95)]!,
			total,
		};
	}

	// -----------------------------------------------------------------------
	// Formatting helpers (for CLI console output)
	// -----------------------------------------------------------------------

	/**
	 * Format the matrix as a console-friendly table string.
	 */
	formatMatrix(summary: AggregatedSummary): string {
		const lines: string[] = [];
		const { browsers, matrix } = summary;

		// Header
		const browserHeaders = browsers.map((b) => b.padEnd(10)).join(' ');
		lines.push(`\n  ${'Scenario'.padEnd(40)} ${browserHeaders}`);
		lines.push(`  ${'─'.repeat(40)} ${'─'.repeat(browsers.length * 11)}`);

		// Rows
		for (const row of matrix) {
			const title = row.title.length > 38 ? `${row.title.slice(0, 35)}...` : row.title;
			const cells = browsers.map((browser) => {
				const cell = row.browsers.get(browser);
				if (!cell || cell.status === 'not-run') return '  -     '.padEnd(10);

				const icon =
					cell.status === 'passed'
						? '\x1b[32m✓\x1b[0m'
						: cell.status === 'failed'
							? '\x1b[31m✗\x1b[0m'
							: '\x1b[33m-\x1b[0m';

				const time =
					cell.duration < 1000 ? `${cell.duration}ms` : `${(cell.duration / 1000).toFixed(1)}s`;
				return `${icon} ${time}`.padEnd(10);
			});

			const flag = row.flaky ? ' 🔄' : row.crossBrowserInconsistent ? ' ⚠️' : '';
			lines.push(`  ${title.padEnd(40)} ${cells.join(' ')}${flag}`);
		}

		// Footer
		lines.push('');
		lines.push('  Legend: ✓ passed  ✗ failed  - skipped  🔄 flaky  ⚠️  inconsistent');
		lines.push('');

		return lines.join('\n');
	}

	/**
	 * Format a concise summary string for console output.
	 */
	formatSummary(summary: AggregatedSummary): string {
		const lines: string[] = [];
		const { totals, timing, browsers, totalDuration, strategy } = summary;

		lines.push('  ═══════════════════════════════════════');
		lines.push(`  Strategy: ${strategy} | Browsers: ${browsers.join(', ')}`);
		lines.push('  ───────────────────────────────────────');

		// Per-browser breakdown
		for (const bs of summary.browserSummaries) {
			const parts: string[] = [];
			if (bs.passed > 0) parts.push(`\x1b[32m${bs.passed} ✓\x1b[0m`);
			if (bs.failed > 0) parts.push(`\x1b[31m${bs.failed} ✗\x1b[0m`);
			if (bs.skipped > 0) parts.push(`\x1b[33m${bs.skipped} -\x1b[0m`);
			lines.push(
				`  ${bs.browser.padEnd(10)} ${parts.join('  ')}  (${this.formatDuration(bs.duration)})`,
			);
		}

		lines.push('  ───────────────────────────────────────');

		// Grand totals
		const totalParts: string[] = [];
		if (totals.passed > 0) totalParts.push(`\x1b[32m${totals.passed} passed\x1b[0m`);
		if (totals.failed > 0) totalParts.push(`\x1b[31m${totals.failed} failed\x1b[0m`);
		if (totals.skipped > 0) totalParts.push(`\x1b[33m${totals.skipped} skipped\x1b[0m`);

		lines.push(`  Total:    ${totalParts.join(', ')} (${totals.scenarios} scenarios)`);

		if (totals.flaky > 0) {
			lines.push(`  Flaky:    \x1b[33m${totals.flaky} tests\x1b[0m`);
		}
		if (totals.crossBrowserInconsistent > 0) {
			lines.push(`  ⚠️  Cross-browser inconsistencies: ${totals.crossBrowserInconsistent}`);
		}

		lines.push(
			`  Timing:   avg ${this.formatDuration(timing.avg)} · p95 ${this.formatDuration(timing.p95)} · max ${this.formatDuration(timing.max)}`,
		);
		lines.push(`  Duration: ${this.formatDuration(totalDuration)}`);
		lines.push('  ═══════════════════════════════════════');
		lines.push('');

		return lines.join('\n');
	}

	private formatDuration(ms: number): string {
		if (ms < 1000) return `${ms}ms`;
		if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
		const minutes = Math.floor(ms / 60_000);
		const seconds = ((ms % 60_000) / 1000).toFixed(1);
		return `${minutes}m ${seconds}s`;
	}
}
