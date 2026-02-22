// ============================================================================
// create-browsecraft
//
// Scaffolds a new Browsecraft project with zero configuration.
//
// Usage:
//   npm init browsecraft              # Interactive setup (TypeScript, E2E)
//   npm init browsecraft -- --bdd     # Include BDD (Gherkin feature files)
//   npm init browsecraft -- --js      # Use JavaScript instead of TypeScript
//   npm init browsecraft my-tests     # Scaffold into a specific directory
//   npm init browsecraft -- --quiet   # Non-interactive, accept all defaults
//
// Zero external dependencies — uses only Node.js built-ins.
// ============================================================================

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Options {
	targetDir: string;
	bdd: boolean;
	typescript: boolean;
	quiet: boolean;
	installDeps: boolean;
	addGitIgnore: boolean;
}

// ---------------------------------------------------------------------------
// ANSI colors (no dependencies)
// ---------------------------------------------------------------------------

const supportsColor =
	process.env.FORCE_COLOR !== '0' &&
	(process.env.FORCE_COLOR !== undefined || (process.stdout.isTTY && process.env.TERM !== 'dumb'));

const fmt = {
	bold: (s: string) => (supportsColor ? `\x1b[1m${s}\x1b[22m` : s),
	green: (s: string) => (supportsColor ? `\x1b[32m${s}\x1b[39m` : s),
	cyan: (s: string) => (supportsColor ? `\x1b[36m${s}\x1b[39m` : s),
	yellow: (s: string) => (supportsColor ? `\x1b[33m${s}\x1b[39m` : s),
	dim: (s: string) => (supportsColor ? `\x1b[2m${s}\x1b[22m` : s),
	red: (s: string) => (supportsColor ? `\x1b[31m${s}\x1b[39m` : s),
};

// ---------------------------------------------------------------------------
// Prompting (zero dependencies — uses Node.js readline)
// ---------------------------------------------------------------------------

function createPrompt() {
	const rl = createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	const ask = (question: string, defaultValue?: string): Promise<string> => {
		const suffix = defaultValue ? fmt.dim(` (${defaultValue})`) : '';
		return new Promise((resolve) => {
			rl.question(`  ${question}${suffix}: `, (answer) => {
				resolve(answer.trim() || defaultValue || '');
			});
		});
	};

	const confirm = (question: string, defaultValue = true): Promise<boolean> => {
		const hint = defaultValue ? 'Y/n' : 'y/N';
		return new Promise((resolve) => {
			rl.question(`  ${question} ${fmt.dim(`(${hint})`)}: `, (answer) => {
				const a = answer.trim().toLowerCase();
				if (a === '') resolve(defaultValue);
				else resolve(a === 'y' || a === 'yes');
			});
		});
	};

	const close = () => rl.close();

	return { ask, confirm, close };
}

// ---------------------------------------------------------------------------
// Package manager detection
// ---------------------------------------------------------------------------

type PackageManager = 'npm' | 'pnpm' | 'yarn';

function detectPackageManager(): PackageManager {
	const agent = process.env.npm_config_user_agent || '';
	if (agent.includes('pnpm')) return 'pnpm';
	if (agent.includes('yarn')) return 'yarn';
	return 'npm';
}

function installCommand(pm: PackageManager, deps: string[], dev = true): string {
	switch (pm) {
		case 'pnpm':
			return `pnpm add ${dev ? '-D' : ''} ${deps.join(' ')}`.trim();
		case 'yarn':
			return `yarn add ${dev ? '--dev' : ''} ${deps.join(' ')}`.trim();
		default:
			return `npm install ${dev ? '--save-dev' : ''} ${deps.join(' ')}`.trim();
	}
}

function runCommand(pm: PackageManager): string {
	return pm === 'npm' ? 'npx' : pm;
}

// ---------------------------------------------------------------------------
// File templates
// ---------------------------------------------------------------------------

function configTemplate(ts: boolean, bdd: boolean): string {
	const ext = ts ? 'ts' : 'js';
	const importLine = ts
		? "import { defineConfig } from 'browsecraft';"
		: "const { defineConfig } = require('browsecraft');";
	const exportLine = ts ? 'export default defineConfig({' : 'module.exports = defineConfig({';

	let config = `${importLine}

${exportLine}
  // Browser to use: 'chrome' | 'firefox' | 'edge'
  browser: 'chrome',

  // Run in headless mode (no visible browser window)
  headless: true,

  // Base URL — lets you write page.go('/login') instead of full URLs
  // baseURL: 'http://localhost:3000',

  // Global timeout for actions (ms)
  timeout: 30_000,

  // Capture a screenshot when a test fails
  screenshot: 'on-failure',`;

	if (bdd) {
		config += `

  // BDD configuration
  bdd: {
    // Directory containing .feature files
    features: './features',

    // Directory containing step definitions
    steps: './steps',

    // Register built-in steps (navigation, clicks, forms, assertions)
    builtInSteps: true,
  },`;
	}

	config += `
});
`;

	return config;
}

function tsconfigTemplate(): string {
	return `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": ".",
    "types": ["node"]
  },
  "include": ["**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
`;
}

function exampleTestTemplate(ts: boolean): string {
	const ext = ts ? 'ts' : 'js';
	if (ts) {
		return `import { test, expect } from 'browsecraft';

test('homepage has correct title', async ({ page }) => {
  await page.go('https://example.com');

  // Assert the page title
  await expect(page).toHaveTitle('Example Domain');
});

test('can see main heading', async ({ page }) => {
  await page.go('https://example.com');

  // page.see() checks that text is visible on the page
  await page.see('Example Domain');
});

test('can navigate to more info', async ({ page }) => {
  await page.go('https://example.com');

  // Click a link by its visible text
  await page.click('More information...');

  // Assert we navigated to the right page
  await expect(page).toHaveURL(/iana\\.org/);
});
`;
	}

	return `const { test, expect } = require('browsecraft');

test('homepage has correct title', async ({ page }) => {
  await page.go('https://example.com');

  // Assert the page title
  await expect(page).toHaveTitle('Example Domain');
});

test('can see main heading', async ({ page }) => {
  await page.go('https://example.com');

  // page.see() checks that text is visible on the page
  await page.see('Example Domain');
});

test('can navigate to more info', async ({ page }) => {
  await page.go('https://example.com');

  // Click a link by its visible text
  await page.click('More information...');

  // Assert we navigated to the right page
  await expect(page).toHaveURL(/iana\\.org/);
});
`;
}

function featureFileTemplate(): string {
	return `Feature: Example Domain
  As a user
  I want to visit Example Domain
  So that I can verify it works correctly

  Scenario: Page loads with correct title
    Given I am on "https://example.com"
    Then I should see "Example Domain"
    And the page title should be "Example Domain"

  Scenario: Navigate to more information
    Given I am on "https://example.com"
    When I click "More information..."
    Then the URL should contain "iana.org"
`;
}

function stepDefinitionsTemplate(ts: boolean): string {
	if (ts) {
		return `import { Given, When, Then, registerBuiltInSteps } from 'browsecraft';

// Register all 38 built-in step definitions
// This gives you steps like:
//   Given I am on {string}
//   When I click {string}
//   When I type {string} into {string}
//   Then I should see {string}
//   Then the page title should be {string}
//   Then the URL should contain {string}
//   ...and many more
registerBuiltInSteps();

// ---------------------------------------------------------------
// Add your custom step definitions below
// ---------------------------------------------------------------

// Example: a custom step that logs in
// Given('I am logged in as {string}', async ({ page }, username: string) => {
//   await page.go('/login');
//   await page.fill('Username', username);
//   await page.fill('Password', 'password123');
//   await page.click('Sign In');
// });
`;
	}

	return `const { Given, When, Then, registerBuiltInSteps } = require('browsecraft');

// Register all 38 built-in step definitions
registerBuiltInSteps();

// ---------------------------------------------------------------
// Add your custom step definitions below
// ---------------------------------------------------------------

// Example: a custom step that logs in
// Given('I am logged in as {string}', async ({ page }, username) => {
//   await page.go('/login');
//   await page.fill('Username', username);
//   await page.fill('Password', 'password123');
//   await page.click('Sign In');
// });
`;
}

function gitignoreEntries(): string {
	return `
# Browsecraft
.browsecraft/
test-results/
`;
}

// ---------------------------------------------------------------------------
// Core scaffolding
// ---------------------------------------------------------------------------

function writeFile(filePath: string, content: string, label: string): boolean {
	if (existsSync(filePath)) {
		console.log(`  ${fmt.yellow('skip')}  ${label} ${fmt.dim('(already exists)')}`);
		return false;
	}
	const dir = join(filePath, '..');
	mkdirSync(dir, { recursive: true });
	writeFileSync(filePath, content, 'utf-8');
	console.log(`  ${fmt.green('create')}  ${label}`);
	return true;
}

function ensureDir(dirPath: string, label: string) {
	if (!existsSync(dirPath)) {
		mkdirSync(dirPath, { recursive: true });
		console.log(`  ${fmt.green('create')}  ${label}/`);
	}
}

function patchGitignore(targetDir: string) {
	const gitignorePath = join(targetDir, '.gitignore');
	if (existsSync(gitignorePath)) {
		const content = readFileSync(gitignorePath, 'utf-8');
		if (!content.includes('.browsecraft')) {
			writeFileSync(gitignorePath, `${content.trimEnd()}\n${gitignoreEntries()}`, 'utf-8');
			console.log(`  ${fmt.green('update')}  .gitignore`);
		}
	} else {
		writeFileSync(gitignorePath, `node_modules/\ndist/\n${gitignoreEntries()}`, 'utf-8');
		console.log(`  ${fmt.green('create')}  .gitignore`);
	}
}

function patchPackageJson(targetDir: string, pm: PackageManager, ts: boolean, bdd: boolean) {
	const pkgPath = join(targetDir, 'package.json');

	let pkg: Record<string, unknown>;
	if (existsSync(pkgPath)) {
		pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
	} else {
		// Create a minimal package.json
		pkg = {
			name: basename(targetDir),
			version: '1.0.0',
			private: true,
		};
	}

	// Ensure scripts
	const scripts = (pkg.scripts as Record<string, string>) || {};
	if (!scripts.test || scripts.test === 'echo "Error: no test specified" && exit 1') {
		scripts.test = 'browsecraft test';
	}
	if (bdd && !scripts['test:bdd']) {
		scripts['test:bdd'] = 'browsecraft test --bdd';
	}
	pkg.scripts = scripts;

	// Set type to module for ES module support
	if (!pkg.type) {
		pkg.type = 'module';
	}

	writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf-8');
	console.log(`  ${fmt.green('update')}  package.json`);
}

function scaffold(options: Options) {
	const { targetDir, bdd, typescript: ts } = options;
	const ext = ts ? 'ts' : 'js';

	console.log();
	console.log(fmt.bold('  Scaffolding project files...'));
	console.log();

	// Config file
	writeFile(
		join(targetDir, `browsecraft.config.${ext}`),
		configTemplate(ts, bdd),
		`browsecraft.config.${ext}`,
	);

	// TypeScript config
	if (ts) {
		writeFile(join(targetDir, 'tsconfig.json'), tsconfigTemplate(), 'tsconfig.json');
	}

	// Example test
	const testDir = existsSync(join(targetDir, 'tests')) ? 'tests' : 'tests';
	ensureDir(join(targetDir, testDir), testDir);
	writeFile(
		join(targetDir, testDir, `example.test.${ext}`),
		exampleTestTemplate(ts),
		`${testDir}/example.test.${ext}`,
	);

	// BDD scaffolding
	if (bdd) {
		ensureDir(join(targetDir, 'features'), 'features');
		writeFile(
			join(targetDir, 'features', 'example.feature'),
			featureFileTemplate(),
			'features/example.feature',
		);

		ensureDir(join(targetDir, 'steps'), 'steps');
		writeFile(
			join(targetDir, 'steps', `steps.${ext}`),
			stepDefinitionsTemplate(ts),
			`steps/steps.${ext}`,
		);
	}

	// .gitignore
	patchGitignore(targetDir);
}

// ---------------------------------------------------------------------------
// Dependency installation
// ---------------------------------------------------------------------------

function installDeps(targetDir: string, pm: PackageManager, ts: boolean) {
	const deps = ['browsecraft'];
	if (ts) {
		deps.push('typescript', '@types/node', 'tsx');
	}

	const cmd = installCommand(pm, deps, true);
	console.log();
	console.log(fmt.bold('  Installing dependencies...'));
	console.log(`  ${fmt.dim(`$ ${cmd}`)}`);
	console.log();

	try {
		execSync(cmd, {
			cwd: targetDir,
			stdio: 'inherit',
			shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
		});
		console.log();
		console.log(`  ${fmt.green('Done!')} Dependencies installed.`);
	} catch {
		console.log();
		console.log(`  ${fmt.yellow('Warning:')} Failed to install dependencies.`);
		console.log(`  Run manually: ${fmt.cyan(cmd)}`);
	}
}

// ---------------------------------------------------------------------------
// Print success
// ---------------------------------------------------------------------------

function printSuccess(options: Options, pm: PackageManager) {
	const run = runCommand(pm);
	const ext = options.typescript ? 'ts' : 'js';
	const inDir =
		options.targetDir !== process.cwd()
			? ` ${fmt.dim(`(in ${basename(options.targetDir)}/)`)}`
			: '';

	console.log();
	console.log(fmt.bold(fmt.green('  Project is ready!')) + inDir);
	console.log();
	console.log('  Created files:');
	console.log(`    ${fmt.cyan(`browsecraft.config.${ext}`)}  Configuration`);
	if (options.typescript) {
		console.log(`    ${fmt.cyan('tsconfig.json')}             TypeScript config`);
	}
	console.log(`    ${fmt.cyan(`tests/example.test.${ext}`)}    Example test`);
	if (options.bdd) {
		console.log(`    ${fmt.cyan('features/example.feature')}  Example feature file`);
		console.log(`    ${fmt.cyan(`steps/steps.${ext}`)}             Step definitions`);
	}
	console.log();
	console.log('  Next steps:');
	console.log();
	if (options.targetDir !== process.cwd()) {
		console.log(`    ${fmt.bold('cd')} ${basename(options.targetDir)}`);
	}
	console.log(`    ${fmt.bold(`${run} browsecraft test`)}               Run all tests`);
	console.log(`    ${fmt.bold(`${run} browsecraft test --headed`)}      Run with visible browser`);
	if (options.bdd) {
		console.log(`    ${fmt.bold(`${run} browsecraft test --bdd`)}        Run BDD feature files`);
	}
	console.log();
	console.log(`  ${fmt.dim('Happy testing!')}`);
	console.log();
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

interface CLIArgs {
	targetDir: string;
	bdd: boolean;
	js: boolean;
	quiet: boolean;
	help: boolean;
}

function parseArgs(argv: string[]): CLIArgs {
	const args = argv.slice(2);
	const result: CLIArgs = {
		targetDir: '.',
		bdd: false,
		js: false,
		quiet: false,
		help: false,
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i]!;
		switch (arg) {
			case '--bdd':
				result.bdd = true;
				break;
			case '--js':
			case '--javascript':
				result.js = true;
				break;
			case '--quiet':
			case '-q':
			case '--yes':
			case '-y':
				result.quiet = true;
				break;
			case '--help':
			case '-h':
				result.help = true;
				break;
			default:
				if (!arg.startsWith('-')) {
					result.targetDir = arg;
				}
				break;
		}
	}

	return result;
}

function printHelp() {
	console.log(`
  ${fmt.bold('create-browsecraft')} — Scaffold a new Browsecraft testing project

  ${fmt.bold('Usage:')}
    npm init browsecraft [directory] [options]
    pnpm create browsecraft [directory] [options]
    yarn create browsecraft [directory] [options]

  ${fmt.bold('Arguments:')}
    [directory]          Target directory (default: current directory)

  ${fmt.bold('Options:')}
    --bdd                Include BDD setup (feature files, step definitions)
    --js, --javascript   Use JavaScript instead of TypeScript (default: TypeScript)
    --quiet, -q, -y      Non-interactive mode, accept all defaults
    --help, -h           Show this help message

  ${fmt.bold('Examples:')}
    npm init browsecraft                     Set up in current directory
    npm init browsecraft my-tests            Set up in ./my-tests/
    npm init browsecraft -- --bdd            Include BDD support
    npm init browsecraft my-tests -- --bdd   BDD project in ./my-tests/
`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
	const cliArgs = parseArgs(process.argv);

	if (cliArgs.help) {
		printHelp();
		return;
	}

	const pm = detectPackageManager();

	console.log();
	console.log(fmt.bold('  Browsecraft') + fmt.dim(' — AI-native browser testing'));

	// Resolve target directory
	const targetDir = resolve(process.cwd(), cliArgs.targetDir);
	const isCurrentDir = targetDir === process.cwd();

	// Auto-detect TypeScript: if tsconfig.json exists, default to TS
	const hasTsConfig = existsSync(join(targetDir, 'tsconfig.json'));
	const defaultTs = !cliArgs.js && (hasTsConfig || true); // TypeScript is default

	let options: Options;

	if (cliArgs.quiet) {
		// Non-interactive mode — accept all defaults
		options = {
			targetDir,
			bdd: cliArgs.bdd,
			typescript: !cliArgs.js,
			quiet: true,
			installDeps: true,
			addGitIgnore: true,
		};
	} else {
		// Interactive mode
		const prompt = createPrompt();

		console.log();

		if (!isCurrentDir) {
			console.log(`  ${fmt.dim(`Project directory: ${targetDir}`)}`);
			console.log();
		}

		// Ask language preference (unless --js flag)
		let useTs = !cliArgs.js;
		if (!cliArgs.js && !hasTsConfig) {
			useTs = await prompt.confirm('Use TypeScript?', true);
		} else if (hasTsConfig) {
			console.log(`  ${fmt.dim('Detected tsconfig.json — using TypeScript')}`);
		}

		// Ask about BDD (unless --bdd flag)
		let useBdd = cliArgs.bdd;
		if (!cliArgs.bdd) {
			useBdd = await prompt.confirm('Include BDD support (Gherkin feature files)?', false);
		}

		// Ask about deps
		const doInstall = await prompt.confirm('Install dependencies?', true);

		prompt.close();

		options = {
			targetDir,
			bdd: useBdd,
			typescript: useTs,
			quiet: false,
			installDeps: doInstall,
			addGitIgnore: true,
		};
	}

	// Create target directory if it doesn't exist
	if (!existsSync(targetDir)) {
		mkdirSync(targetDir, { recursive: true });
	}

	// Ensure package.json exists and update scripts
	patchPackageJson(targetDir, pm, options.typescript, options.bdd);

	// Scaffold project files
	scaffold(options);

	// Install dependencies
	if (options.installDeps) {
		installDeps(targetDir, pm, options.typescript);
	}

	// Print success
	printSuccess(options, pm);
}

main().catch((err) => {
	console.error(`\n  ${fmt.red('Error:')} ${err instanceof Error ? err.message : String(err)}\n`);
	process.exit(1);
});
