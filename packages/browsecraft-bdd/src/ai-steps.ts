// ============================================================================
// AI-Powered Auto Step Definition Generation.
//
// Mode 3: Write only the .feature file, and AI generates step definitions
// automatically using GitHub Models API (free with a GitHub PAT).
//
// Features:
// - Analyze .feature file to find undefined steps
// - Generate TypeScript step definitions using LLM
// - Generate with context from existing step definitions
// - Support for smart patterns with {string}, {int}, etc.
// - Output as ready-to-use TypeScript code
//
// Graceful degradation: If no GitHub token is available, returns helpful
// error messages with manual step definition stubs instead.
//
// Built from scratch. No external codegen dependency.
// ============================================================================

import {
	isGitHubModelsAvailable,
	githubModelsChat,
	type ChatMessage,
} from 'browsecraft-ai';

import { parseGherkin, type GherkinDocument, type Step, type Scenario, type Feature } from './gherkin-parser.js';
import { type StepRegistry, globalRegistry, type StepDefinition } from './step-registry.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GeneratedStepDef {
	/** The step keyword (Given, When, Then) */
	keyword: string;
	/** The pattern string (e.g., 'I am on the {string} page') */
	pattern: string;
	/** The generated TypeScript function body */
	body: string;
	/** Full TypeScript code for this step definition */
	code: string;
	/** The original step text from the .feature file */
	originalText: string;
}

export interface AutoStepResult {
	/** Generated step definitions */
	steps: GeneratedStepDef[];
	/** Full TypeScript file content (all steps combined) */
	fileContent: string;
	/** Whether AI was used (false = fallback stubs) */
	aiGenerated: boolean;
	/** Any warnings or info messages */
	messages: string[];
}

export interface AutoStepOptions {
	/** Step registry to check for existing definitions. Default: globalRegistry */
	registry?: StepRegistry;
	/** Additional context to help AI (e.g., app description, URL patterns) */
	appContext?: string;
	/** Whether to include browsecraft page API hints. Default: true */
	includeBrowsecraftHints?: boolean;
	/** Model to use. Default: 'openai/gpt-4.1' */
	model?: string;
	/** Only generate for undefined steps (skip steps that already have definitions). Default: true */
	skipDefined?: boolean;
}

// ---------------------------------------------------------------------------
// Main API
// ---------------------------------------------------------------------------

/**
 * Auto-generate step definitions from a .feature file source.
 *
 * ```ts
 * import { autoGenerateSteps } from 'browsecraft';
 *
 * const result = await autoGenerateSteps(`
 *   Feature: Login
 *     Scenario: Valid credentials
 *       Given I am on the login page
 *       When I fill "Email" with "user@test.com"
 *       And I click "Sign In"
 *       Then I should see "Welcome"
 * `);
 *
 * // result.fileContent contains ready-to-use TypeScript step definitions
 * console.log(result.fileContent);
 * ```
 */
export async function autoGenerateSteps(
	featureSource: string,
	options: AutoStepOptions = {},
): Promise<AutoStepResult> {
	const registry = options.registry ?? globalRegistry;
	const skipDefined = options.skipDefined ?? true;

	// Parse the feature file
	const doc = parseGherkin(featureSource);
	if (!doc.feature) {
		return {
			steps: [],
			fileContent: '// No feature found in source',
			aiGenerated: false,
			messages: ['No Feature found in the provided source.'],
		};
	}

	// Collect all unique steps
	const uniqueSteps = collectUniqueSteps(doc);

	// Filter out already-defined steps
	const undefinedSteps = skipDefined
		? uniqueSteps.filter((s) => !registry.match(s.text))
		: uniqueSteps;

	if (undefinedSteps.length === 0) {
		return {
			steps: [],
			fileContent: '// All steps are already defined!',
			aiGenerated: false,
			messages: ['All steps already have matching step definitions.'],
		};
	}

	// Try AI generation first
	if (await isGitHubModelsAvailable()) {
		try {
			return await generateWithAI(undefinedSteps, doc.feature, registry, options);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			// Fall through to stub generation
			return generateStubs(undefinedSteps, [
				`AI generation failed (${msg}). Falling back to stub generation.`,
			]);
		}
	}

	// Fallback: generate stubs
	return generateStubs(undefinedSteps, [
		'No GitHub token detected. Generated stub step definitions.',
		'Set GITHUB_TOKEN environment variable with models scope for AI-powered generation.',
	]);
}

/**
 * Auto-generate step definitions from a parsed GherkinDocument.
 */
export async function autoGenerateStepsFromDocument(
	document: GherkinDocument,
	options: AutoStepOptions = {},
): Promise<AutoStepResult> {
	const registry = options.registry ?? globalRegistry;
	const skipDefined = options.skipDefined ?? true;

	if (!document.feature) {
		return {
			steps: [],
			fileContent: '// No feature found in document',
			aiGenerated: false,
			messages: ['No Feature found in the provided document.'],
		};
	}

	const uniqueSteps = collectUniqueSteps(document);
	const undefinedSteps = skipDefined
		? uniqueSteps.filter((s) => !registry.match(s.text))
		: uniqueSteps;

	if (undefinedSteps.length === 0) {
		return {
			steps: [],
			fileContent: '// All steps are already defined!',
			aiGenerated: false,
			messages: ['All steps already have matching step definitions.'],
		};
	}

	if (await isGitHubModelsAvailable()) {
		try {
			return await generateWithAI(undefinedSteps, document.feature, registry, options);
		} catch {
			return generateStubs(undefinedSteps, [
				'AI generation failed. Falling back to stub generation.',
			]);
		}
	}

	return generateStubs(undefinedSteps, [
		'No GitHub token detected. Generated stub step definitions.',
	]);
}

// ---------------------------------------------------------------------------
// AI Generation
// ---------------------------------------------------------------------------

async function generateWithAI(
	steps: UniqueStep[],
	feature: Feature,
	registry: StepRegistry,
	options: AutoStepOptions,
): Promise<AutoStepResult> {
	const model = options.model ?? 'openai/gpt-4.1';
	const includeHints = options.includeBrowsecraftHints ?? true;

	// Build the prompt
	const existingDefs = registry.getAll();
	const existingContext = existingDefs.length > 0
		? `\n\nExisting step definitions for reference (match their style):\n${existingDefs.slice(0, 10).map((d) => `  ${d.type}('${d.pattern}', ...)`).join('\n')}`
		: '';

	const browscraftHints = includeHints
		? `\n\nBrowsecraft Page API (use these methods in step implementations):
- page.goto(url) — navigate to a URL
- page.click(text) — click element by visible text
- page.fill(label, value) — fill input by label text
- page.type(selector, text) — type text character by character
- page.select(label, value) — select dropdown option
- page.check(label) — check a checkbox
- page.uncheck(label) — uncheck a checkbox
- page.waitForText(text) — wait for text to appear
- page.content() — get page HTML content
- page.title() — get page title
- page.screenshot() — take a screenshot
- page.locator(text) — find element by text/selector`
		: '';

	const appContext = options.appContext ? `\n\nApplication context: ${options.appContext}` : '';

	const stepsText = steps.map((s) => `  ${s.keyword} ${s.text}`).join('\n');

	const messages: ChatMessage[] = [
		{
			role: 'system',
			content: `You are a BDD step definition generator for the Browsecraft testing framework.
Generate TypeScript step definitions for the given Gherkin steps.

Rules:
1. Use Cucumber-style patterns with {string}, {int}, {float}, {word} parameter types
2. Import Given, When, Then from 'browsecraft'
3. Step functions receive (world, ...args) where world has { page, browser, ctx }
4. Use async/await for page interactions
5. Use descriptive but concise parameter names
6. Group related steps logically
7. Add JSDoc comments for complex steps
8. Return ONLY valid TypeScript code, no markdown fences
${browscraftHints}${existingContext}${appContext}`,
		},
		{
			role: 'user',
			content: `Generate step definitions for feature "${feature.name}":\n\n${stepsText}`,
		},
	];

	const response = await githubModelsChat(messages, { model, temperature: 0.2 });

	if (!response) {
		return generateStubs(steps, [
			'AI returned empty response. Falling back to stub generation.',
		]);
	}

	// Parse the AI response into individual step definitions
	const generatedSteps = parseAIResponse(response, steps);

	return {
		steps: generatedSteps,
		fileContent: response,
		aiGenerated: true,
		messages: [`Generated ${generatedSteps.length} step definitions using AI (${model}).`],
	};
}

// ---------------------------------------------------------------------------
// Stub Generation (fallback when AI is not available)
// ---------------------------------------------------------------------------

function generateStubs(steps: UniqueStep[], messages: string[]): AutoStepResult {
	const generatedSteps: GeneratedStepDef[] = [];

	for (const step of steps) {
		const { pattern, paramList } = inferPattern(step.text);
		const keyword = normalizeKeyword(step.keyword);

		const params = paramList.length > 0
			? `, ${paramList.join(', ')}`
			: '';

		const body = '  // TODO: implement this step\n  throw new Error(\'Step not implemented\');';
		const code = `${keyword}('${pattern}', async ({ page }${params}) => {\n${body}\n});`;

		generatedSteps.push({
			keyword,
			pattern,
			body,
			code,
			originalText: step.text,
		});
	}

	const imports = "import { Given, When, Then } from 'browsecraft';\n\n";
	const fileContent = imports + generatedSteps.map((s) => s.code).join('\n\n') + '\n';

	return {
		steps: generatedSteps,
		fileContent,
		aiGenerated: false,
		messages,
	};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface UniqueStep {
	keyword: string;
	text: string;
}

function collectUniqueSteps(doc: GherkinDocument): UniqueStep[] {
	const seen = new Set<string>();
	const result: UniqueStep[] = [];

	if (!doc.feature) return result;

	const processSteps = (steps: Step[], lastKeyword = 'Given') => {
		for (const step of steps) {
			let keyword: string;
			if (step.keywordType === 'Context') keyword = 'Given';
			else if (step.keywordType === 'Action') keyword = 'When';
			else if (step.keywordType === 'Outcome') keyword = 'Then';
			else keyword = lastKeyword; // And/But inherit

			const key = `${keyword}:${step.text}`;
			if (!seen.has(key)) {
				seen.add(key);
				result.push({ keyword, text: step.text });
			}
			lastKeyword = keyword;
		}
	};

	const processScenario = (scenario: Scenario) => {
		processSteps(scenario.steps);
	};

	for (const child of doc.feature.children) {
		if ('background' in child) {
			processSteps(child.background.steps);
		} else if ('scenario' in child) {
			processScenario(child.scenario);
		} else if ('rule' in child) {
			for (const ruleChild of child.rule.children) {
				if ('background' in ruleChild) {
					processSteps(ruleChild.background.steps);
				} else if ('scenario' in ruleChild) {
					processScenario(ruleChild.scenario);
				}
			}
		}
	}

	return result;
}

function normalizeKeyword(keyword: string): string {
	switch (keyword) {
		case 'Given': return 'Given';
		case 'When': return 'When';
		case 'Then': return 'Then';
		default: return 'Given';
	}
}

/**
 * Infer a Cucumber-style pattern from a step text.
 * Detects quoted strings, numbers, etc. and replaces them with parameter placeholders.
 */
function inferPattern(text: string): { pattern: string; paramList: string[] } {
	let pattern = text;
	const params: string[] = [];
	let paramCount = 0;

	// Replace quoted strings with {string}
	pattern = pattern.replace(/"([^"]*)"/g, () => {
		paramCount++;
		params.push(`arg${paramCount}`);
		return '{string}';
	});

	// Replace numbers with {int} or {float}
	pattern = pattern.replace(/\b(\d+\.\d+)\b/g, () => {
		paramCount++;
		params.push(`num${paramCount}`);
		return '{float}';
	});

	pattern = pattern.replace(/\b(\d+)\b/g, () => {
		paramCount++;
		params.push(`num${paramCount}`);
		return '{int}';
	});

	return { pattern, paramList: params };
}

function parseAIResponse(response: string, originalSteps: UniqueStep[]): GeneratedStepDef[] {
	const results: GeneratedStepDef[] = [];

	// Try to extract individual step definitions from the AI response
	// Match patterns like: Given('...', async (...) => { ... });
	const stepRegex = /(Given|When|Then)\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*async\s*\([^)]*\)\s*=>\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}\s*\)/g;

	let match: RegExpExecArray | null;
	let idx = 0;

	while ((match = stepRegex.exec(response)) !== null) {
		const keyword = match[1]!;
		const pattern = match[2]!;
		const body = match[3]!.trim();
		const originalText = originalSteps[idx]?.text ?? pattern;

		results.push({
			keyword,
			pattern,
			body,
			code: match[0],
			originalText,
		});
		idx++;
	}

	// If regex matching failed, return one big result with the full response
	if (results.length === 0 && originalSteps.length > 0) {
		results.push({
			keyword: originalSteps[0]!.keyword,
			pattern: originalSteps[0]!.text,
			body: response,
			code: response,
			originalText: originalSteps[0]!.text,
		});
	}

	return results;
}
