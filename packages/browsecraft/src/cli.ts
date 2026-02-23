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

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { type RunnableTest, type RunnerOptions, TestRunner } from 'browsecraft-runner';
import { Browser } from './browser.js';
import { type UserConfig, resolveConfig } from './config.js';
import { type TestCase, runAfterAllHooks, runTest, testRegistry } from './test.js';

const VERSION = '0.3.0';

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
		case 'setup-ide':
			await setupIde();
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
	const filePatterns = args.filter((a) => !a.startsWith('--'));

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

	// BDD mode: run .feature files with step definitions
	if (flags.bdd) {
		await runBddTests(config, userConfig);
		return;
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

		// For TypeScript files, register a TypeScript loader if available
		if (file.endsWith('.ts') || file.endsWith('.mts')) {
			await ensureTypeScriptLoader();
		}

		const fileUrl = pathToFileURL(file).href;
		await import(fileUrl);
		return testRegistry.slice(startIdx).map((tc) => ({
			title: tc.title,
			suitePath: tc.suitePath,
			skip: tc.skip,
			only: tc.only,
			options: tc.options,
			fn: tc.fn as (fixtures: unknown) => Promise<void>,
		}));
	};

	// Launch a shared browser for all tests
	let sharedBrowser: Browser | undefined;

	try {
		sharedBrowser = await Browser.launch({
			browser: config.browser,
			headless: config.headless,
			executablePath: config.executablePath,
			debug: config.debug,
			timeout: config.timeout,
		});
	} catch (err) {
		console.error(`Failed to launch browser: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(1);
	}

	// executeTest callback: runs a single test with fixture setup/teardown
	const executeTest = async (test: RunnableTest) => {
		return runTest(test as unknown as TestCase, sharedBrowser);
	};

	try {
		const exitCode = await runner.run(loadFile, executeTest);
		await sharedBrowser.close().catch(() => {});
		process.exit(exitCode);
	} catch (err) {
		await sharedBrowser?.close().catch(() => {});
		throw err;
	}
}

// ---------------------------------------------------------------------------
// BDD Command — runs .feature files with step definitions
// ---------------------------------------------------------------------------

async function runBddTests(
	config: ReturnType<typeof resolveConfig>,
	userConfig?: UserConfig,
): Promise<void> {
	const bddModule = (await import('browsecraft-bdd')) as typeof import('browsecraft-bdd');
	const { parseGherkin, BddExecutor, registerBuiltInSteps, After } = bddModule;
	const cwd = process.cwd();

	// Resolve BDD config from user config
	const bddConfig = userConfig?.bdd ?? {};
	const featuresPattern = bddConfig.features ?? 'features/**/*.feature';
	const stepsPattern = bddConfig.steps ?? 'steps/**/*.{ts,js,mts,mjs}';
	const useBuiltInSteps = bddConfig.builtInSteps !== false; // default true

	// Step 1: Discover .feature files
	const featureFiles = discoverFiles(cwd, featuresPattern, ['.feature']);
	if (featureFiles.length === 0) {
		console.log('\n  No .feature files found.\n');
		console.log(`  Feature pattern: ${featuresPattern}`);
		console.log('  Create features/*.feature files or adjust bdd.features in your config.\n');
		process.exit(0);
	}

	// Step 2: Register built-in steps if enabled
	if (useBuiltInSteps) {
		registerBuiltInSteps();
	}

	// Step 3: Load step definition files
	const stepFiles = discoverFiles(cwd, stepsPattern, ['.ts', '.js', '.mts', '.mjs']);
	for (const stepFile of stepFiles) {
		if (stepFile.endsWith('.ts') || stepFile.endsWith('.mts')) {
			await ensureTypeScriptLoader();
		}
		const fileUrl = pathToFileURL(stepFile).href;
		await import(fileUrl);
	}

	// Step 3b: Register an After hook to clean up browser contexts per scenario
	After(async ({ world }) => {
		const w = world as any;
		if (w?._context) {
			await w._context.close().catch(() => {});
		}
	});

	// Step 4: Parse .feature files into GherkinDocuments
	const documents = featureFiles.map((file) => {
		const source = readFileSync(file, 'utf-8');
		return parseGherkin(source, relative(cwd, file));
	});

	// Step 5: Launch browser
	let browser: Browser;
	try {
		browser = await Browser.launch({
			browser: config.browser,
			headless: config.headless,
			executablePath: config.executablePath,
			debug: config.debug,
			timeout: config.timeout,
		});
	} catch (err) {
		console.error(`Failed to launch browser: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(1);
	}

	// Step 6: Create executor with a worldFactory that provides page + browser
	const executor = new BddExecutor({
		stepTimeout: config.timeout,
		worldFactory: async () => {
			const context = await browser.newContext();
			const page = await context.newPage();
			return {
				page,
				browser,
				ctx: {},
				attach: () => {},
				log: (msg: string) => console.log(`      ${msg}`),
				// Store context for cleanup
				_context: context,
			};
		},
		onFeatureStart: (feature) => {
			console.log(`\n  Feature: ${feature.name}`);
		},
		onScenarioStart: (scenario) => {
			console.log(`    Scenario: ${scenario.name}`);
		},
		onStepEnd: (result) => {
			const icon =
				result.status === 'passed'
					? '\x1b[32m+\x1b[0m'
					: result.status === 'failed'
						? '\x1b[31mx\x1b[0m'
						: result.status === 'undefined'
							? '\x1b[33m?\x1b[0m'
							: result.status === 'pending'
								? '\x1b[33m-\x1b[0m'
								: '\x1b[90m-\x1b[0m';
			console.log(`      ${icon} ${result.keyword.trim()} ${result.text} (${result.duration}ms)`);
			if (result.status === 'failed' && result.error) {
				console.log(`        ${result.error.message}`);
			}
			if (result.status === 'undefined') {
				console.log('        Step not defined. Add it to your step definitions.');
			}
		},
		onScenarioEnd: () => {},
	});

	// Step 7: Run features
	console.log(
		`\n  Browsecraft BDD - Running ${featureFiles.length} feature file${featureFiles.length > 1 ? 's' : ''}\n`,
	);

	try {
		const result = await executor.run(documents);

		// Print summary
		console.log('\n  ─────────────────────────────────────');
		const { scenarios, steps } = result.summary;

		const scenarioParts: string[] = [];
		if (scenarios.passed > 0) scenarioParts.push(`\x1b[32m${scenarios.passed} passed\x1b[0m`);
		if (scenarios.failed > 0) scenarioParts.push(`\x1b[31m${scenarios.failed} failed\x1b[0m`);
		if (scenarios.skipped > 0) scenarioParts.push(`\x1b[33m${scenarios.skipped} skipped\x1b[0m`);
		if (scenarios.pending > 0) scenarioParts.push(`\x1b[33m${scenarios.pending} pending\x1b[0m`);

		const stepParts: string[] = [];
		if (steps.passed > 0) stepParts.push(`\x1b[32m${steps.passed} passed\x1b[0m`);
		if (steps.failed > 0) stepParts.push(`\x1b[31m${steps.failed} failed\x1b[0m`);
		if (steps.undefined > 0) stepParts.push(`\x1b[33m${steps.undefined} undefined\x1b[0m`);
		if (steps.skipped > 0) stepParts.push(`\x1b[90m${steps.skipped} skipped\x1b[0m`);

		console.log(`  Scenarios: ${scenarioParts.join(', ')} (${scenarios.total} total)`);
		console.log(`  Steps:     ${stepParts.join(', ')} (${steps.total} total)`);
		console.log(
			`  Time:      ${result.duration < 1000 ? `${result.duration}ms` : `${(result.duration / 1000).toFixed(1)}s`}`,
		);
		console.log('');

		if (scenarios.failed > 0) {
			console.log('  \x1b[31mSome scenarios failed.\x1b[0m\n');
		} else if (steps.undefined > 0) {
			console.log('  \x1b[33mSome steps are undefined.\x1b[0m\n');
		} else {
			console.log('  \x1b[32mAll scenarios passed!\x1b[0m\n');
		}

		await browser.close().catch(() => {});
		process.exit(scenarios.failed > 0 || steps.undefined > 0 ? 1 : 0);
	} catch (err) {
		await browser.close().catch(() => {});
		console.error(`BDD execution error: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(1);
	}
}

/**
 * Discover files matching a glob-like pattern within a directory.
 * Supports patterns like 'features/**\/*.feature' or 'steps/**\/*.{ts,js}'.
 */
function discoverFiles(rootDir: string, pattern: string, extensions: string[]): string[] {
	const files: string[] = [];

	// Extract the base directory from the pattern (e.g., 'features' from 'features/**/*.feature')
	const baseParts = pattern.split('/');
	let baseDir = rootDir;
	for (const part of baseParts) {
		if (part.includes('*') || part.includes('{')) break;
		baseDir = join(baseDir, part);
	}

	if (!existsSync(baseDir)) return files;

	const walkDir = (dir: string): void => {
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
				walkDir(fullPath);
			} else if (stat.isFile()) {
				if (extensions.some((ext) => entry.endsWith(ext))) {
					files.push(fullPath);
				}
			}
		}
	};

	walkDir(baseDir);
	return files.sort();
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
		writeFileSync(
			configPath,
			`import { defineConfig } from 'browsecraft';

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
`,
		);
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
		writeFileSync(
			exampleTest,
			`import { test, expect } from 'browsecraft';

test('homepage has correct title', async ({ page }) => {
  await page.goto('https://example.com');
  await expect(page).toHaveTitle('Example Domain');
});

test('can navigate to more info', async ({ page }) => {
  await page.goto('https://example.com');
  await page.click('More information');
  await expect(page).toHaveURL(/iana\\.org/);
});
`,
		);
		console.log('  Created tests/example.test.ts');
	} else {
		console.log('  tests/example.test.ts already exists, skipping');
	}

	// Add .browsecraft to .gitignore
	const gitignorePath = join(cwd, '.gitignore');
	if (existsSync(gitignorePath)) {
		const content = await import('node:fs').then((fs) => fs.readFileSync(gitignorePath, 'utf-8'));
		if (!content.includes('.browsecraft')) {
			writeFileSync(gitignorePath, `${content.trimEnd()}\n\n# Browsecraft\n.browsecraft/\n`);
			console.log('  Updated .gitignore');
		}
	}

	console.log('\n  Setup complete! Run your first test:\n');
	console.log('    npx browsecraft test\n');
}

// ---------------------------------------------------------------------------
// Setup IDE — configures VS Code for Cucumber/Gherkin step discovery
// ---------------------------------------------------------------------------

async function setupIde() {
	const cwd = process.cwd();

	console.log('\n  Browsecraft — IDE Setup\n');
	console.log('  Configuring VS Code for Cucumber/Gherkin step discovery...\n');

	// Detect steps directory
	const stepsDir = existsSync(join(cwd, 'steps'))
		? 'steps'
		: existsSync(join(cwd, 'step-definitions'))
			? 'step-definitions'
			: existsSync(join(cwd, 'step_definitions'))
				? 'step_definitions'
				: 'steps';

	// Detect features directory
	const featuresDir = existsSync(join(cwd, 'features'))
		? 'features'
		: existsSync(join(cwd, 'test/features'))
			? 'test/features'
			: 'features';

	// Resolve the browsecraft-bdd glue path
	let gluePath = 'node_modules/browsecraft-bdd/glue/steps.js';
	try {
		const { createRequire } = await import('node:module');
		const userRequire = createRequire(join(cwd, 'package.json'));
		const bddPkgPath = userRequire.resolve('browsecraft-bdd/package.json');
		const bddDir = join(bddPkgPath, '..');
		const relGlue = relative(cwd, join(bddDir, 'glue', 'steps.js')).replace(/\\/g, '/');
		if (existsSync(join(bddDir, 'glue', 'steps.js'))) {
			gluePath = relGlue;
		}
	} catch {
		// browsecraft-bdd not installed yet — use default path
	}

	// Create .vscode directory
	const vscodeDir = join(cwd, '.vscode');
	if (!existsSync(vscodeDir)) {
		mkdirSync(vscodeDir, { recursive: true });
		console.log('  \x1b[32mcreate\x1b[0m  .vscode/');
	}

	// Write or merge settings.json
	const settingsPath = join(vscodeDir, 'settings.json');
	const cucumberSettings: Record<string, unknown> = {
		'cucumberautocomplete.steps': [
			`${stepsDir}/**/*.ts`,
			`${stepsDir}/**/*.js`,
			gluePath,
		],
		'cucumberautocomplete.strictGherkinCompletion': true,
		'cucumberautocomplete.strictGherkinValidation': true,
		'cucumber.glue': [
			`${stepsDir}/**/*.ts`,
			`${stepsDir}/**/*.js`,
			gluePath,
		],
		'cucumber.features': [`${featuresDir}/**/*.feature`],
	};

	if (existsSync(settingsPath)) {
		try {
			const existing = JSON.parse(readFileSync(settingsPath, 'utf-8'));
			let updated = false;
			for (const [key, value] of Object.entries(cucumberSettings)) {
				if (!(key in existing)) {
					existing[key] = value;
					updated = true;
				}
			}
			if (updated) {
				writeFileSync(settingsPath, JSON.stringify(existing, null, 2) + '\n', 'utf-8');
				console.log('  \x1b[32mupdate\x1b[0m  .vscode/settings.json');
			} else {
				console.log('  \x1b[33mskip\x1b[0m    .vscode/settings.json \x1b[2m(already configured)\x1b[0m');
			}
		} catch {
			writeFileSync(settingsPath, JSON.stringify(cucumberSettings, null, 2) + '\n', 'utf-8');
			console.log('  \x1b[32mcreate\x1b[0m  .vscode/settings.json');
		}
	} else {
		writeFileSync(settingsPath, JSON.stringify(cucumberSettings, null, 2) + '\n', 'utf-8');
		console.log('  \x1b[32mcreate\x1b[0m  .vscode/settings.json');
	}

	// Write or merge extensions.json
	const extensionsPath = join(vscodeDir, 'extensions.json');
	const recommendedExtensions = [
		'alexkrechik.cucumberautocomplete',
		'CucumberOpen.cucumber-official',
	];

	if (existsSync(extensionsPath)) {
		try {
			const existing = JSON.parse(readFileSync(extensionsPath, 'utf-8'));
			const recs: string[] = existing.recommendations ?? [];
			let updated = false;
			for (const ext of recommendedExtensions) {
				if (!recs.includes(ext)) {
					recs.push(ext);
					updated = true;
				}
			}
			if (updated) {
				existing.recommendations = recs;
				writeFileSync(extensionsPath, JSON.stringify(existing, null, 2) + '\n', 'utf-8');
				console.log('  \x1b[32mupdate\x1b[0m  .vscode/extensions.json');
			} else {
				console.log('  \x1b[33mskip\x1b[0m    .vscode/extensions.json \x1b[2m(already configured)\x1b[0m');
			}
		} catch {
			writeFileSync(
				extensionsPath,
				JSON.stringify({ recommendations: recommendedExtensions }, null, 2) + '\n',
				'utf-8',
			);
			console.log('  \x1b[32mcreate\x1b[0m  .vscode/extensions.json');
		}
	} else {
		writeFileSync(
			extensionsPath,
			JSON.stringify({ recommendations: recommendedExtensions }, null, 2) + '\n',
			'utf-8',
		);
		console.log('  \x1b[32mcreate\x1b[0m  .vscode/extensions.json');
	}

	console.log('\n  \x1b[32mDone!\x1b[0m IDE configured for Cucumber/Gherkin support.\n');
	console.log('  What was set up:');
	console.log('    \x1b[36m•\x1b[0m Cucumber extension discovers your custom steps');
	console.log('    \x1b[36m•\x1b[0m Cucumber extension discovers BrowseCraft\'s 38 built-in steps');
	console.log('    \x1b[36m•\x1b[0m Ctrl+Click navigation from .feature files to step definitions');
	console.log('    \x1b[36m•\x1b[0m Autocomplete suggestions when writing features');
	console.log('    \x1b[36m•\x1b[0m Recommended Cucumber extensions for VS Code');
	console.log();
	console.log('  If prompted, install the recommended extensions when VS Code asks.');
	console.log();
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
				// For .ts files, ensure a TypeScript loader is registered
				if (name.endsWith('.ts') || name.endsWith('.mts')) {
					await ensureTypeScriptLoader();
				}
				const fileUrl = pathToFileURL(configPath).href;
				const mod = await import(fileUrl);
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
// TypeScript Loader
// ---------------------------------------------------------------------------

let tsLoaderRegistered = false;

/**
 * Ensure a TypeScript loader is registered so that .ts test files can be imported.
 * Tries tsx first (fastest), then ts-node, then falls back to a helpful error.
 *
 * Resolution note: tsx is installed in the USER's project, not in browsecraft itself.
 * We must resolve it from the user's cwd using createRequire, not from our package.
 */
async function ensureTypeScriptLoader(): Promise<void> {
	if (tsLoaderRegistered) return;

	// Check if we're already running under a TS loader (e.g., `tsx`, `ts-node`, `bun`)
	// In that case, .ts imports already work
	const execArgs = process.execArgv.join(' ');
	if (
		execArgs.includes('tsx') ||
		execArgs.includes('ts-node') ||
		execArgs.includes('loader') ||
		process.versions.bun // Bun handles TS natively
	) {
		tsLoaderRegistered = true;
		return;
	}

	// Create a require function rooted at the user's cwd so we can find tsx/ts-node
	// installed in the user's project (not in our package)
	const { createRequire } = await import('node:module');
	const userRequire = createRequire(pathToFileURL(resolve(process.cwd(), 'package.json')));

	// Strategy 1: tsx 4.x — use the tsx/esm/api register() function
	// This is the modern approach that works with tsx 4.x+
	try {
		const tsxApiPath = userRequire.resolve('tsx/esm/api');
		const { register } = await import(pathToFileURL(tsxApiPath).href);
		if (typeof register === 'function') {
			register();
			tsLoaderRegistered = true;
			return;
		}
	} catch {
		// tsx/esm/api not available, try next strategy
	}

	// Strategy 2: Older tsx/ts-node — use Node.js module.register()
	// Works with tsx <4.x and ts-node
	for (const loader of ['tsx/esm', 'ts-node/esm']) {
		try {
			const { register } = await import('node:module');
			if (typeof register === 'function') {
				// Resolve from user's project root so the loader is found
				register(loader, pathToFileURL(resolve(process.cwd(), '/')));
				tsLoaderRegistered = true;
				return;
			}
		} catch {
			// Loader not available, try next
		}
	}

	// If neither tsx nor ts-node is available, give a helpful error
	console.error(
		'\n  Error: Cannot import TypeScript test files.\n' +
			'  Install tsx (recommended) or ts-node:\n\n' +
			'    npm install -D tsx\n\n' +
			'  Or run browsecraft with tsx:\n\n' +
			'    npx tsx node_modules/.bin/browsecraft test\n',
	);
	process.exit(1);
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
	bdd?: boolean;
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
			case '--bdd':
				flags.bdd = true;
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
    browsecraft test --bdd [options]
    browsecraft init
    browsecraft setup-ide

  Commands:
    test          Run browser tests
    test --bdd    Run BDD feature files (Gherkin)
    init          Create a new project with example config and test
    setup-ide     Configure VS Code for Cucumber step discovery

  Options:
    --bdd               Run BDD feature files instead of programmatic tests
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
    browsecraft test --bdd                       # Run all .feature files
    browsecraft test --bdd --headed              # Run BDD in headed mode
    browsecraft setup-ide                        # Auto-configure IDE for BDD
`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

main().catch((err) => {
	console.error('Fatal error:', err.message);
	process.exit(1);
});
