// ============================================================================
// GitHub Models API integration — detect availability and call LLMs.
// All AI features gracefully degrade when no GitHub token is configured.
//
// Auth: Set GITHUB_TOKEN or BROWSECRAFT_GITHUB_TOKEN env var
//       (PAT with `models` scope).
// ============================================================================

export interface AICapabilities {
	/** Whether the GitHub Models API is reachable and authenticated */
	available: boolean;
	/** Whether vision-capable models are available (always true when available) */
	hasVision: boolean;
	/** Whether code-capable models are available (always true when available) */
	hasCodeModel: boolean;
	/** The default model for general tasks */
	defaultModel: string;
	/** The model used for vision tasks (visual diff) */
	visionModel: string;
}

/** Default model for general tasks (fast, free-tier friendly) */
const DEFAULT_MODEL = 'openai/gpt-4o-mini';

/** Vision model for image analysis (visual diff) */
const VISION_MODEL = 'openai/gpt-4o';

/** GitHub Models API endpoint */
const API_ENDPOINT = 'https://models.github.ai/inference/chat/completions';

/**
 * Resolve the GitHub token from environment variables or explicit value.
 * Checks BROWSECRAFT_GITHUB_TOKEN first, then GITHUB_TOKEN.
 */
export function resolveToken(explicitToken?: string): string | null {
	if (explicitToken) return explicitToken;
	return (
		process.env.BROWSECRAFT_GITHUB_TOKEN ??
		process.env.GITHUB_TOKEN ??
		null
	);
}

/**
 * Check whether the GitHub Models API is reachable and the token is valid.
 *
 * ```ts
 * if (await isGitHubModelsAvailable()) {
 *   console.log('AI features enabled!');
 * }
 * ```
 */
export async function isGitHubModelsAvailable(
	token?: string,
): Promise<boolean> {
	const resolved = resolveToken(token);
	if (!resolved) return false;

	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 5000);

		// Send a minimal request to verify auth works
		const res = await fetch(API_ENDPOINT, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${resolved}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				model: DEFAULT_MODEL,
				messages: [{ role: 'user', content: 'hi' }],
				max_tokens: 1,
			}),
			signal: controller.signal,
		});

		clearTimeout(timeout);
		return res.ok;
	} catch {
		return false;
	}
}

/**
 * Detect AI capabilities. When GitHub Models API is available, all
 * capabilities are supported (vision, code, general).
 *
 * ```ts
 * const caps = await detectCapabilities();
 * if (caps.hasVision) {
 *   // visual diff using AI is available
 * }
 * ```
 */
export async function detectCapabilities(
	token?: string,
): Promise<AICapabilities> {
	const unavailable: AICapabilities = {
		available: false,
		hasVision: false,
		hasCodeModel: false,
		defaultModel: DEFAULT_MODEL,
		visionModel: VISION_MODEL,
	};

	const resolved = resolveToken(token);
	if (!resolved) return unavailable;

	const available = await isGitHubModelsAvailable(resolved);
	if (!available) return unavailable;

	return {
		available: true,
		hasVision: true,
		hasCodeModel: true,
		defaultModel: DEFAULT_MODEL,
		visionModel: VISION_MODEL,
	};
}

/** A single message in the chat completions format */
export interface ChatMessage {
	role: 'system' | 'user' | 'assistant';
	content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

/**
 * Send a chat completion request to GitHub Models API.
 * Used internally by self-healing, test-gen, visual-diff, etc.
 *
 * Returns the assistant's text response, or null on failure.
 */
export async function githubModelsChat(
	messages: ChatMessage[],
	options: {
		model?: string;
		token?: string;
		temperature?: number;
		maxTokens?: number;
	} = {},
): Promise<string | null> {
	const resolved = resolveToken(options.token);
	if (!resolved) return null;

	const model = options.model ?? DEFAULT_MODEL;

	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 60_000);

		const body = {
			model,
			messages,
			temperature: options.temperature ?? 0.3,
			max_tokens: options.maxTokens ?? 2048,
		};

		const res = await fetch(API_ENDPOINT, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${resolved}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(body),
			signal: controller.signal,
		});

		clearTimeout(timeout);

		if (!res.ok) return null;

		const data = (await res.json()) as {
			choices?: Array<{
				message?: { content?: string };
			}>;
		};

		return data.choices?.[0]?.message?.content?.trim() ?? null;
	} catch {
		return null;
	}
}

/**
 * Convenience wrapper that mimics the old ollamaGenerate() signature
 * for easier migration. Builds chat messages from a prompt + optional system.
 */
export async function githubModelsGenerate(
	prompt: string,
	options: {
		model?: string;
		system?: string;
		token?: string;
		temperature?: number;
		maxTokens?: number;
	} = {},
): Promise<string | null> {
	const messages: ChatMessage[] = [];

	if (options.system) {
		messages.push({ role: 'system', content: options.system });
	}

	messages.push({ role: 'user', content: prompt });

	return githubModelsChat(messages, {
		model: options.model,
		token: options.token,
		temperature: options.temperature,
		maxTokens: options.maxTokens,
	});
}
