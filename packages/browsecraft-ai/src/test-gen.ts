// ============================================================================
// Test generation — turn natural language descriptions into Browsecraft test
// code. Uses Ollama for AI generation, with a template-based fallback.
//
// Works WITHOUT AI: generates a skeleton test with TODO comments.
// Works WITH AI: generates complete, runnable test code.
// ============================================================================

import { ollamaGenerate, isOllamaAvailable, detectCapabilities } from './ollama.js';

export interface GenerateTestOptions {
	/** Natural language description of what to test */
	description: string;
	/** URL of the page to test */
	url?: string;
	/** Additional context (e.g. page structure, selectors) */
	context?: string;
	/** Ollama base URL */
	ollamaUrl?: string;
	/** Preferred Ollama model */
	model?: string;
	/** Whether to include assertions (default true) */
	includeAssertions?: boolean;
	/** Test style: 'browsecraft' uses test() fixtures, 'script' uses raw API */
	style?: 'browsecraft' | 'script';
}

export interface GeneratedTest {
	/** The generated test code */
	code: string;
	/** Whether AI was used to generate the code */
	aiGenerated: boolean;
	/** The model used, if AI was involved */
	model?: string;
	/** Human-readable notes about the generated test */
	notes: string[];
}

const BROWSECRAFT_API_REFERENCE = `
Browsecraft API Quick Reference:
- test('name', async ({ page }) => { ... }) — define a test with page fixture
- page.goto(url) — navigate to URL
- page.click(selector) — click element (selector can be visible text, CSS, or aria-label)
- page.fill(selector, value) — fill input field
- page.type(selector, value) — type into field character by character
- page.check(selector) — check a checkbox
- page.select(selector, value) — select dropdown option
- page.hover(selector) — hover over element
- page.screenshot(path?) — take screenshot
- page.waitForSelector(selector) — wait for element to appear
- page.waitForURL(pattern) — wait for URL to match
- page.innerText(selector) — get visible text
- page.evaluate(fn) — run JS in the browser

Assertions (all auto-retry):
- expect(page).toHaveTitle(expected)
- expect(page).toHaveURL(expected)
- expect(page).toHaveContent(text)
- expect(locator).toBeVisible()
- expect(locator).toHaveText(expected)
- expect(locator).toHaveValue(expected)
- expect(locator).toBeEnabled()
- expect(locator).toBeChecked()
- expect(locator).toHaveAttribute(name, value)
- expect(locator).toHaveCSS(prop, value)
- expect(locator).toHaveCount(n)

Import: import { test, expect } from 'browsecraft';
`.trim();

/**
 * Generate a Browsecraft test from a natural language description.
 *
 * ```ts
 * const result = await generateTest({
 *   description: 'Test that a user can log in with valid credentials',
 *   url: 'https://example.com/login',
 * });
 * console.log(result.code);
 * ```
 */
export async function generateTest(
	options: GenerateTestOptions,
): Promise<GeneratedTest> {
	const {
		description,
		url,
		context,
		ollamaUrl,
		model,
		includeAssertions = true,
		style = 'browsecraft',
	} = options;

	// Try AI generation first
	try {
		const available = await isOllamaAvailable(ollamaUrl);
		if (available) {
			const caps = await detectCapabilities(ollamaUrl);
			const selectedModel =
				model ?? caps.defaultModel ?? 'llama3.1';

			const aiResult = await generateWithAI(
				description,
				selectedModel,
				{
					url,
					context,
					ollamaUrl,
					includeAssertions,
					style,
				},
			);

			if (aiResult) {
				return {
					code: aiResult,
					aiGenerated: true,
					model: selectedModel,
					notes: [
						`Generated using ${selectedModel} via Ollama`,
						'Review the generated code before running — AI output may need adjustments',
					],
				};
			}
		}
	} catch {
		// Fall through to template
	}

	// Fallback: template-based generation
	const code = generateFromTemplate(description, {
		url,
		includeAssertions,
		style,
	});

	return {
		code,
		aiGenerated: false,
		notes: [
			'Generated from template (Ollama not available)',
			'Fill in the TODO comments with actual selectors and values',
			'Install and run Ollama for AI-powered test generation',
		],
	};
}

// ---------------------------------------------------------------------------
// AI generation via Ollama
// ---------------------------------------------------------------------------

async function generateWithAI(
	description: string,
	modelName: string,
	options: {
		url?: string;
		context?: string;
		ollamaUrl?: string;
		includeAssertions: boolean;
		style: 'browsecraft' | 'script';
	},
): Promise<string | null> {
	const styleHint =
		options.style === 'browsecraft'
			? 'Use the test() function with page fixture pattern.'
			: 'Use a raw script with Browser.launch() and page = await browser.newPage().';

	const prompt = `Generate a Browsecraft browser automation test based on this description:

"${description}"

${options.url ? `Target URL: ${options.url}` : ''}
${options.context ? `Additional context: ${options.context}` : ''}

${BROWSECRAFT_API_REFERENCE}

Requirements:
- ${styleHint}
- Write TypeScript code.
- ${options.includeAssertions ? 'Include meaningful assertions to verify behavior.' : 'No assertions needed, just perform the actions.'}
- Use smart selectors: prefer visible text (e.g., page.click('Submit')) over CSS selectors.
- Keep the test focused and readable.
- Respond with ONLY the code, no explanations or markdown fences.`;

	const response = await ollamaGenerate(prompt, {
		model: modelName,
		baseUrl: options.ollamaUrl,
		system:
			'You are a browser test automation expert. You write clean, readable Browsecraft tests. Output only valid TypeScript code with no markdown formatting.',
		temperature: 0.2,
		maxTokens: 2048,
	});

	if (!response) return null;

	// Clean up response — remove markdown fences if the model added them anyway
	let code = response
		.replace(/^```(?:typescript|ts|javascript|js)?\s*\n?/gm, '')
		.replace(/\n?```\s*$/gm, '')
		.trim();

	// Basic validation: must contain at least an import or function call
	if (
		!code.includes('import') &&
		!code.includes('test(') &&
		!code.includes('page.')
	) {
		return null;
	}

	// Ensure import statement is present
	if (!code.includes("from 'browsecraft'") && !code.includes('from "browsecraft"')) {
		const importLine =
			options.style === 'browsecraft'
				? "import { test, expect } from 'browsecraft';"
				: "import { Browser } from 'browsecraft';";
		code = `${importLine}\n\n${code}`;
	}

	return code;
}

// ---------------------------------------------------------------------------
// Template-based fallback (no AI needed)
// ---------------------------------------------------------------------------

function generateFromTemplate(
	description: string,
	options: {
		url?: string;
		includeAssertions: boolean;
		style: 'browsecraft' | 'script';
	},
): string {
	const testName = description
		.replace(/[^a-zA-Z0-9\s]/g, '')
		.trim()
		.slice(0, 80);

	const urlLine = options.url
		? `  await page.goto('${options.url}');`
		: "  await page.goto('https://example.com'); // TODO: set your URL";

	if (options.style === 'script') {
		return `import { Browser } from 'browsecraft';

// ${description}
async function main() {
  const browser = await Browser.launch('chrome');
  const page = await browser.newPage();

${urlLine}

  // TODO: Add your automation steps here
  // Examples:
  // await page.click('Submit');
  // await page.fill('#email', 'user@example.com');
  // await page.waitForSelector('.success-message');

  await page.screenshot('result.png');
  await browser.close();
}

main().catch(console.error);
`;
	}

	const assertions = options.includeAssertions
		? `
  // TODO: Add assertions
  // expect(page).toHaveTitle('Expected Title');
  // expect(page).toHaveURL(/expected-path/);`
		: '';

	return `import { test, expect } from 'browsecraft';

test('${testName}', async ({ page }) => {
${urlLine}

  // TODO: Add your test steps here
  // Examples:
  // await page.click('Submit');
  // await page.fill('#email', 'user@example.com');
  // await page.waitForSelector('.success-message');
${assertions}
});
`;
}
