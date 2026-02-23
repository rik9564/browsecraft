// ============================================================================
// Multi-Provider AI Chat — unified interface for all supported LLM providers.
//
// Supported providers:
//   1. GitHub Models   — free with GITHUB_TOKEN (default)
//   2. OpenAI          — direct API (gpt-4o, gpt-4o-mini, etc.)
//   3. Anthropic       — Claude API (claude-sonnet, etc.)
//   4. Ollama          — local models (llama3.2, mistral, etc.)
//
// All providers conform to the same ChatMessage → string interface.
// This module is the single place to add new provider support.
// ============================================================================

import {
	type ChatMessage,
	githubModelsChat,
	isGitHubModelsAvailable,
	resolveToken,
} from './github-models.js';

// ---------------------------------------------------------------------------
// Provider types
// ---------------------------------------------------------------------------

export type ProviderName = 'github-models' | 'openai' | 'anthropic' | 'ollama';

export interface ProviderConfig {
	provider: ProviderName;
	/** Model name (provider-specific) */
	model?: string;
	/** Auth token or API key */
	token?: string;
	/** Custom base URL (OpenAI-compatible endpoints, Ollama host) */
	baseUrl?: string;
}

export interface ChatOptions {
	temperature?: number;
	maxTokens?: number;
}

// ---------------------------------------------------------------------------
// Default models per provider
// ---------------------------------------------------------------------------

const DEFAULT_MODELS: Record<ProviderName, string> = {
	'github-models': 'openai/gpt-4.1',
	openai: 'gpt-4o-mini',
	anthropic: 'claude-sonnet-4-20250514',
	ollama: 'llama3.2',
};

// ---------------------------------------------------------------------------
// Provider availability check
// ---------------------------------------------------------------------------

/**
 * Check if a provider is available (has valid credentials / reachable).
 */
export async function isProviderAvailable(config: ProviderConfig): Promise<boolean> {
	switch (config.provider) {
		case 'github-models': {
			const token = config.token || resolveToken();
			return token ? isGitHubModelsAvailable(token) : false;
		}

		case 'openai': {
			const key = config.token || process.env.OPENAI_API_KEY;
			if (!key) return false;
			try {
				const baseUrl =
					config.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
				const res = await fetch(`${baseUrl}/models`, {
					headers: { Authorization: `Bearer ${key}` },
					signal: AbortSignal.timeout(5000),
				});
				return res.ok;
			} catch {
				return false;
			}
		}

		case 'anthropic': {
			const key = config.token || process.env.ANTHROPIC_API_KEY;
			if (!key) return false;
			// Anthropic doesn't have a simple health-check endpoint.
			// If the key is set, assume it's valid (will fail at chat time if not).
			return true;
		}

		case 'ollama': {
			const host = config.baseUrl || process.env.OLLAMA_HOST || 'http://localhost:11434';
			try {
				const res = await fetch(`${host}/api/tags`, {
					signal: AbortSignal.timeout(3000),
				});
				return res.ok;
			} catch {
				return false;
			}
		}

		default:
			return false;
	}
}

// ---------------------------------------------------------------------------
// Unified chat function
// ---------------------------------------------------------------------------

/**
 * Send a chat completion to any supported provider.
 * Returns the assistant's text response, or null on failure.
 *
 * ```ts
 * const response = await providerChat(
 *   [{ role: 'user', content: 'Hello' }],
 *   { provider: 'openai', token: 'sk-...' },
 * );
 * ```
 */
export async function providerChat(
	messages: ChatMessage[],
	config: ProviderConfig,
	options: ChatOptions = {},
): Promise<string | null> {
	const model = config.model || DEFAULT_MODELS[config.provider];

	switch (config.provider) {
		case 'github-models':
			return githubModelsChat(messages, {
				model,
				token: config.token || undefined,
				temperature: options.temperature ?? 0.3,
				maxTokens: options.maxTokens ?? 2048,
			});

		case 'openai':
			return openaiChat(messages, {
				model,
				apiKey: config.token || process.env.OPENAI_API_KEY || '',
				baseUrl: config.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
				temperature: options.temperature ?? 0.3,
				maxTokens: options.maxTokens ?? 2048,
			});

		case 'anthropic':
			return anthropicChat(messages, {
				model,
				apiKey: config.token || process.env.ANTHROPIC_API_KEY || '',
				temperature: options.temperature ?? 0.3,
				maxTokens: options.maxTokens ?? 2048,
			});

		case 'ollama':
			return ollamaChat(messages, {
				model,
				baseUrl: config.baseUrl || process.env.OLLAMA_HOST || 'http://localhost:11434',
				temperature: options.temperature ?? 0.3,
			});

		default:
			return null;
	}
}

// ---------------------------------------------------------------------------
// OpenAI — direct API (also works for Azure OpenAI, any OpenAI-compatible)
// ---------------------------------------------------------------------------

async function openaiChat(
	messages: ChatMessage[],
	opts: { model: string; apiKey: string; baseUrl: string; temperature: number; maxTokens: number },
): Promise<string | null> {
	if (!opts.apiKey) return null;

	try {
		const res = await fetch(`${opts.baseUrl}/chat/completions`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${opts.apiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				model: opts.model,
				messages,
				temperature: opts.temperature,
				max_tokens: opts.maxTokens,
			}),
			signal: AbortSignal.timeout(60_000),
		});

		if (!res.ok) return null;

		const data = (await res.json()) as {
			choices?: Array<{ message?: { content?: string } }>;
		};

		return data.choices?.[0]?.message?.content?.trim() ?? null;
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// Anthropic — Messages API (https://docs.anthropic.com/en/api/messages)
// ---------------------------------------------------------------------------

async function anthropicChat(
	messages: ChatMessage[],
	opts: { model: string; apiKey: string; temperature: number; maxTokens: number },
): Promise<string | null> {
	if (!opts.apiKey) return null;

	// Anthropic uses a separate system parameter, not a system message
	let system: string | undefined;
	const apiMessages: Array<{ role: string; content: string }> = [];

	for (const msg of messages) {
		if (msg.role === 'system') {
			system = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
		} else {
			apiMessages.push({
				role: msg.role,
				content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
			});
		}
	}

	try {
		const body: Record<string, unknown> = {
			model: opts.model,
			messages: apiMessages,
			temperature: opts.temperature,
			max_tokens: opts.maxTokens,
		};

		if (system) {
			body.system = system;
		}

		const res = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: {
				'x-api-key': opts.apiKey,
				'anthropic-version': '2023-06-01',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(60_000),
		});

		if (!res.ok) return null;

		const data = (await res.json()) as {
			content?: Array<{ type: string; text?: string }>;
		};

		const textBlock = data.content?.find((b) => b.type === 'text');
		return textBlock?.text?.trim() ?? null;
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// Ollama — local inference (https://github.com/ollama/ollama/blob/main/docs/api.md)
// ---------------------------------------------------------------------------

async function ollamaChat(
	messages: ChatMessage[],
	opts: { model: string; baseUrl: string; temperature: number },
): Promise<string | null> {
	try {
		const ollamaMessages = messages.map((m) => ({
			role: m.role,
			content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
		}));

		const res = await fetch(`${opts.baseUrl}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: opts.model,
				messages: ollamaMessages,
				stream: false,
				options: { temperature: opts.temperature },
			}),
			signal: AbortSignal.timeout(120_000), // Local models can be slower
		});

		if (!res.ok) return null;

		const data = (await res.json()) as {
			message?: { content?: string };
		};

		return data.message?.content?.trim() ?? null;
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get the default model for a provider.
 */
export function getDefaultModel(provider: ProviderName): string {
	return DEFAULT_MODELS[provider] || DEFAULT_MODELS['github-models'];
}

/**
 * Get a human-readable label for a provider.
 */
export function getProviderLabel(provider: ProviderName): string {
	switch (provider) {
		case 'github-models':
			return 'GitHub Models (free)';
		case 'openai':
			return 'OpenAI';
		case 'anthropic':
			return 'Anthropic Claude';
		case 'ollama':
			return 'Ollama (local)';
		default:
			return String(provider);
	}
}
