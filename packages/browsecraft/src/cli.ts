#!/usr/bin/env node
// ============================================================================
// Browsecraft - CLI
// The command-line interface for running tests and initializing projects.
//
// npx browsecraft test              # Run all tests
// npx browsecraft test login.test.ts # Run specific file
// npx browsecraft init              # Scaffold a new project
// npx browsecraft --help            # Show help
// ============================================================================

import { resolve, join } from 'node:path';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { TestRunner, type RunnerOptions, type RunnableTest } from 'browsecraft-runner';
import { resolveConfig, type UserConfig } from './config.js';
import { testRegistry, runTest, type TestCase } from './test.js';

const VERSION = '0.1.0';

async function main() {
	const args = process.argv.slice(2);

	if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
		printHelp();
		return;
	}

	if (args.includes('--version') || args.includes('-v')) {
		console.log(`browsecraft v${VERSION}`);
		return;
	}

	const command = args[0];

	switch (command) {
		case 'test':
			await runTests(args.slice(1));
			break;
		case 'init':
			await initProject();
			break;
		default:
			// If no command, assume it's a file path to test
			if (command && (command.endsWith('.ts') || command.endsWith('.js'))) {
				await runTests(args);
			} else {
				console.error(`Unknown command: ${command}`);
				console.error('Run "browsecraft --help" for usage information.');
				process.exit(1);
			}
	}
}

// ---------------------------------------------------------------------------
// Test Command
// ---------------------------------------------------------------------------

async function runTests(args: string[]) {
	// Parse CLI flags
	const flags = parseFlags(args);
	const filePatterns = args.filter(a => !a.startsWith('--'));

	// Load config file if it exists
	const userConfig = await loadConfig();
	const config = resolveConfig(userConfig);

	// Apply CLI overrides
	if (flags.headed || flags.headless === false) {
		config.headless = false;
	}
	if (flags.browser) {
		config.browser = flags.browser as any;
	}
	if (flags.workers !== undefined) {
		config.workers = flags.workers;
	}
	if (flags.timeout !== undefined) {
		config.timeout = flags.timeout;
	}
	if (flags.retries !== undefined) {
		config.retries = flags.retries;
	}
	if (flags.debug) {
		config.debug = true;
	}

	// Set up runner options
	const runnerOptions: RunnerOptions = {
		config,
		files: filePatterns.length > 0 ? filePatterns : undefined,
		grep: flags.grep,
		bail: flags.bail,
	};

	// Run tests
	const runner = new TestRunner(runnerOptions);

	// loadFile callback: imports the test file and returns registered tests
	const loadFile = async (file: string): Promise<RunnableTest[]> => {
		const startIdx = testRegistry.length;
		const fileUrl = pathToFileURL(file).href;
		await import(fileUrl);
		return testRegistry.slice(startIdx).map(tc => ({
			title: tc.title,
			suitePath: tc.suitePath,
			skip: tc.skip,
			only: tc.only,
			options: tc.options,
			fn: tc.fn as (fixtures: unknown) => Promise<void>,
		}));
	};

	// executeTest callback: runs a single test with fixture setup/teardown
	const executeTest = async (test: RunnableTest) => {
		return runTest(test as unknown as TestCase);
	};

	const exitCode = await runner.run(loadFile, executeTest);
	process.exit(exitCode);
}

// ---------------------------------------------------------------------------
// Init Command
// ---------------------------------------------------------------------------

async function initProject() {
	const cwd = process.cwd();

	console.log('\n  Browsecraft - Project Setup\n');

	// Create config file
	const configPath = join(cwd, 'browsecraft.config.ts');
	if (!existsSync(configPath)) {
		writeFileSync(configPath, `import { defineConfig } from 'browsecraft';

export default defineConfig({
  // Browser to use: 'chrome' | 'firefox' | 'edge'
  browser: 'chrome',

  // Run tests in headless mode
  headless: true,

  // Base URL for page.goto() calls
  // baseURL: 'http://localhost:3000',

  // Global timeout for actions (ms)
  timeout: 30_000,

  // Take screenshots on failure
  screenshot: 'on-failure',
});
`);
		console.log('  Created browsecraft.config.ts');
	} else {
		console.log('  browsecraft.config.ts already exists, skipping');
	}

	// Create example test
	const testsDir = join(cwd, 'tests');
	if (!existsSync(testsDir)) {
		mkdirSync(testsDir, { recursive: true });
	}

	const exampleTest = join(testsDir, 'example.test.ts');
	if (!existsSync(exampleTest)) {
		writeFileSync(exampleTest, `import { test, expect } from 'browsecraft';

test('homepage has correct title', async ({ page }) => {
  await page.goto('https://example.com');
  await expect(page).toHaveTitle('Example Domain');
});

test('can navigate to more info', async ({ page }) => {
  await page.goto('https://example.com');
  await page.click('More information');
  await expect(page).toHaveURL(/iana\\.org/);
});
`);
		console.log('  Created tests/example.test.ts');
	} else {
		console.log('  tests/example.test.ts already exists, skipping');
	}

	// Add .browsecraft to .gitignore
	const gitignorePath = join(cwd, '.gitignore');
	if (existsSync(gitignorePath)) {
		const content = await import('node:fs').then(fs => fs.readFileSync(gitignorePath, 'utf-8'));
		if (!content.includes('.browsecraft')) {
			writeFileSync(gitignorePath, `${content.trimEnd()}\n\n# Browsecraft\n.browsecraft/\n`);
			console.log('  Updated .gitignore');
		}
	}

	console.log('\n  Setup complete! Run your first test:\n');
	console.log('    npx browsecraft test\n');
}

// ---------------------------------------------------------------------------
// Config Loading
// ---------------------------------------------------------------------------

async function loadConfig(): Promise<UserConfig | undefined> {
	const cwd = process.cwd();
	const candidates = [
		'browsecraft.config.ts',
		'browsecraft.config.js',
		'browsecraft.config.mjs',
		'browsecraft.config.mts',
	];

	for (const name of candidates) {
		const configPath = resolve(cwd, name);
		if (existsSync(configPath)) {
			try {
				// For .ts files, we need tsx or ts-node to be available
				const mod = await import(configPath);
				return mod.default ?? mod;
			} catch {
				// Config file exists but couldn't be loaded -- continue with defaults
				console.warn(`Warning: Could not load ${name}. Using defaults.`);
			}
		}
	}

	return undefined;
}

// ---------------------------------------------------------------------------
// Flag parsing
// ---------------------------------------------------------------------------

interface CLIFlags {
	headed?: boolean;
	headless?: boolean;
	browser?: string;
	workers?: number;
	timeout?: number;
	retries?: number;
	grep?: string;
	bail?: boolean;
	debug?: boolean;
}

function parseFlags(args: string[]): CLIFlags {
	const flags: CLIFlags = {};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i]!;
		switch (arg) {
			case '--headed':
				flags.headed = true;
				break;
			case '--headless':
				flags.headless = true;
				break;
			case '--debug':
				flags.debug = true;
				break;
			case '--bail':
				flags.bail = true;
				break;
			case '--browser':
				flags.browser = args[++i];
				break;
			case '--workers':
				flags.workers = Number.parseInt(args[++i] ?? '1', 10);
				break;
			case '--timeout':
				flags.timeout = Number.parseInt(args[++i] ?? '30000', 10);
				break;
			case '--retries':
				flags.retries = Number.parseInt(args[++i] ?? '0', 10);
				break;
			case '--grep':
			case '-g':
				flags.grep = args[++i];
				break;
		}
	}

	return flags;
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

function printHelp() {
	console.log(`
  browsecraft v${VERSION} -- AI-native browser testing

  Usage:
    browsecraft test [files...] [options]
    browsecraft init

  Commands:
    test          Run browser tests
    init          Create a new project with example config and test

  Options:
    --browser <name>    Browser to use: chrome, firefox, edge (default: chrome)
    --headed            Run in headed mode (show the browser)
    --headless          Run in headless mode (default)
    --workers <n>       Number of parallel workers (default: half CPU cores)
    --timeout <ms>      Global timeout in milliseconds (default: 30000)
    --retries <n>       Retry failed tests n times (default: 0)
    --grep <pattern>    Only run tests matching pattern
    --bail              Stop after first failure
    --debug             Enable verbose debug logging
    -h, --help          Show this help message
    -v, --version       Show version

  Examples:
    browsecraft test                          # Run all tests
    browsecraft test tests/login.test.ts      # Run specific file
    browsecraft test --headed --browser firefox
    browsecraft test --grep "login" --bail
`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

main().catch((err) => {
	console.error('Fatal error:', err.message);
	process.exit(1);
});
