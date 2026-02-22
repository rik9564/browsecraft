// ============================================================================
// Ollama integration — detect Ollama availability and model capabilities.
// All AI features gracefully degrade when Ollama is not running.
// ============================================================================

export interface AICapabilities {
	/** Whether Ollama is reachable */
	available: boolean;
	/** List of models currently loaded */
	models: string[];
	/** Whether a vision-capable model is available (for visual diff) */
	hasVision: boolean;
	/** Whether a code-capable model is available (for test generation) */
	hasCodeModel: boolean;
	/** The best available model for general tasks */
	defaultModel: string | null;
	/** The best available vision model */
	visionModel: string | null;
}

/** Known vision-capable model families */
const VISION_MODELS = ['llava', 'bakllava', 'moondream', 'llava-phi3', 'minicpm-v'];

/** Known code-capable model families */
const CODE_MODELS = [
	'codellama',
	'deepseek-coder',
	'starcoder',
	'codegemma',
	'qwen2.5-coder',
	'codestral',
	'granite-code',
];

/** General-purpose models in preference order */
const GENERAL_MODELS = [
	'llama3.1',
	'llama3',
	'llama3.2',
	'mistral',
	'gemma2',
	'qwen2.5',
	'phi3',
	'deepseek-v2',
];

const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434';

/**
 * Check whether Ollama is running and reachable.
 *
 * ```ts
 * if (await isOllamaAvailable()) {
 *   console.log('AI features enabled!');
 * }
 * ```
 */
export async function isOllamaAvailable(
	baseUrl = DEFAULT_OLLAMA_URL,
): Promise<boolean> {
	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 2000);
		const res = await fetch(baseUrl, { signal: controller.signal });
		clearTimeout(timeout);
		return res.ok;
	} catch {
		return false;
	}
}

/**
 * Detect which AI capabilities are available via the local Ollama instance.
 *
 * ```ts
 * const caps = await detectCapabilities();
 * if (caps.hasVision) {
 *   // visual diff using AI is available
 * }
 * ```
 */
export async function detectCapabilities(
	baseUrl = DEFAULT_OLLAMA_URL,
): Promise<AICapabilities> {
	const empty: AICapabilities = {
		available: false,
		models: [],
		hasVision: false,
		hasCodeModel: false,
		defaultModel: null,
		visionModel: null,
	};

	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 3000);
		const res = await fetch(`${baseUrl}/api/tags`, {
			signal: controller.signal,
		});
		clearTimeout(timeout);

		if (!res.ok) return empty;

		const data = (await res.json()) as {
			models?: Array<{ name: string; details?: { family?: string } }>;
		};

		const models = (data.models ?? []).map((m) => m.name);

		const matchFamily = (name: string, families: string[]) =>
			families.some((f) => name.toLowerCase().startsWith(f));

		const visionModel =
			models.find((m) => matchFamily(m, VISION_MODELS)) ?? null;
		const codeModel =
			models.find((m) => matchFamily(m, CODE_MODELS)) ?? null;
		const generalModel =
			models.find((m) => matchFamily(m, GENERAL_MODELS)) ?? null;

		return {
			available: true,
			models,
			hasVision: visionModel !== null,
			hasCodeModel: codeModel !== null,
			defaultModel: generalModel ?? codeModel ?? models[0] ?? null,
			visionModel,
		};
	} catch {
		return empty;
	}
}

/**
 * Send a prompt to Ollama and get a text response.
 * Used internally by self-healing, test-gen, etc.
 */
export async function ollamaGenerate(
	prompt: string,
	options: {
		model?: string;
		system?: string;
		baseUrl?: string;
		temperature?: number;
		maxTokens?: number;
	} = {},
): Promise<string | null> {
	const baseUrl = options.baseUrl ?? DEFAULT_OLLAMA_URL;
	const model = options.model ?? 'llama3.1';

	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 60_000);

		const body: Record<string, unknown> = {
			model,
			prompt,
			stream: false,
			options: {
				temperature: options.temperature ?? 0.3,
				num_predict: options.maxTokens ?? 2048,
			},
		};

		if (options.system) {
			body.system = options.system;
		}

		const res = await fetch(`${baseUrl}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
			signal: controller.signal,
		});

		clearTimeout(timeout);

		if (!res.ok) return null;

		const data = (await res.json()) as { response?: string };
		return data.response?.trim() ?? null;
	} catch {
		return null;
	}
}
