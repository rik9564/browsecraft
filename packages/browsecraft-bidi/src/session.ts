// ============================================================================
// Browsecraft BiDi - Session Manager
// High-level client that combines Transport + Launcher into a usable API.
// This is the main entry point for the BiDi layer.
// ============================================================================

import { type BidiOverCdpConnection, connectBidiOverCdp } from './bidi-over-cdp.js';
import {
	type BrowserName,
	type LaunchOptions,
	type LaunchResult,
	launchBrowser,
} from './launcher.js';
import { Transport, type TransportOptions } from './transport.js';
import type { EventHandler } from './transport.js';
import type {
	BiDiEvent,
	BrowsingContextCaptureScreenshotParams,
	BrowsingContextCaptureScreenshotResult,
	BrowsingContextCloseParams,
	BrowsingContextCreateParams,
	BrowsingContextCreateResult,
	BrowsingContextGetTreeResult,
	BrowsingContextHandleUserPromptParams,
	BrowsingContextInfo,
	BrowsingContextLocateNodesParams,
	BrowsingContextLocateNodesResult,
	BrowsingContextNavigateParams,
	BrowsingContextNavigateResult,
	BrowsingContextReloadParams,
	BrowsingContextSetViewportParams,
	BrowsingContextTraverseHistoryParams,
	InputPerformActionsParams,
	InputReleaseActionsParams,
	InputSetFilesParams,
	Locator,
	NetworkAddInterceptParams,
	NetworkAddInterceptResult,
	NetworkContinueRequestParams,
	NetworkContinueResponseParams,
	NetworkContinueWithAuthParams,
	NetworkFailRequestParams,
	NetworkProvideResponseParams,
	NodeRemoteValue,
	ScriptAddPreloadScriptParams,
	ScriptAddPreloadScriptResult,
	ScriptCallFunctionParams,
	ScriptEvaluateParams,
	ScriptEvaluateResult,
	ScriptRemovePreloadScriptParams,
	SessionNewResult,
	SharedReference,
	StorageDeleteCookiesParams,
	StorageDeleteCookiesResult,
	StorageGetCookiesParams,
	StorageGetCookiesResult,
	StorageSetCookieParams,
	StorageSetCookieResult,
} from './types.js';
import { sanitize } from './utils.js';

export type { EventHandler } from './transport.js';

/** Convert a typed params object to Record<string, unknown> for transport */
function toParams(obj: object): Record<string, unknown> {
	return obj as unknown as Record<string, unknown>;
}

/** Cast transport result to a specific type */
function asResult<T>(promise: Promise<Record<string, unknown>>): Promise<T> {
	return promise as unknown as Promise<T>;
}

/** Options for creating a BiDi session */
export interface SessionOptions extends LaunchOptions {
	/** Transport options (timeouts, debugging hooks) */
	transport?: TransportOptions;
	/** Set to true to enable verbose logging */
	debug?: boolean;
}

/**
 * BiDiSession is the main client for communicating with a browser.
 *
 * Usage:
 * ```ts
 * const session = await BiDiSession.launch({ browser: 'chrome' });
 *
 * const { context } = await session.browsingContext.create({ type: 'tab' });
 * await session.browsingContext.navigate({ context, url: 'https://example.com', wait: 'complete' });
 *
 * const result = await session.script.evaluate({
 *   expression: 'document.title',
 *   target: { context },
 *   awaitPromise: false,
 * });
 *
 * await session.close();
 * ```
 */
export class BiDiSession {
	private transport: Transport;
	private launchResult: LaunchResult | null = null;
	private cdpConnection: BidiOverCdpConnection | null = null;
	private sessionId: string | null = null;

	// Module APIs -- organized just like the W3C spec
	readonly browsingContext: BrowsingContextModule;
	readonly script: ScriptModule;
	readonly network: NetworkModule;
	readonly input: InputModule;
	readonly storage: StorageModule;

	private constructor(transport: Transport) {
		this.transport = transport;
		this.browsingContext = new BrowsingContextModule(transport);
		this.script = new ScriptModule(transport);
		this.network = new NetworkModule(transport);
		this.input = new InputModule(transport);
		this.storage = new StorageModule(transport);
	}

	/**
	 * Launch a browser and create a BiDi session.
	 * This is the primary way to start using Browsecraft.
	 *
	 * Automatically detects the browser type:
	 * - Chrome/Edge: uses BiDi-over-CDP (chromium-bidi mapper)
	 * - Firefox: connects directly via native BiDi WebSocket
	 */
	static async launch(options: SessionOptions = {}): Promise<BiDiSession> {
		const browser = options.browser ?? 'chrome';
		const transportOptions: TransportOptions = {
			timeout: options.timeout ?? 30_000,
			...options.transport,
		};

		// Add debug logging if requested
		if (options.debug) {
			transportOptions.onRawMessage = (dir, data) => {
				const prefix = dir === 'send' ? '>>> SEND' : '<<< RECV';
				let logData = data;
				try {
					const parsed = JSON.parse(data);
					const sanitized = sanitize(parsed);
					logData = JSON.stringify(sanitized);
				} catch {
					// Fallback to raw data if not JSON
				}
				console.log(`${prefix}: ${logData.slice(0, 500)}`);
			};
		}

		const transport = new Transport(transportOptions);
		const session = new BiDiSession(transport);

		// Launch browser
		const launchResult = await launchBrowser(options);
		session.launchResult = launchResult;

		if (browser === 'firefox') {
			// Firefox speaks native BiDi -- connect directly via WebSocket
			await transport.connect(launchResult.wsEndpoint);
		} else {
			// Chrome/Edge: the wsEndpoint is a CDP endpoint, not BiDi.
			// We use the chromium-bidi mapper to translate BiDi <-> CDP.
			const cdpConn = await connectBidiOverCdp(launchResult.wsEndpoint, options.debug ?? false);
			session.cdpConnection = cdpConn;

			// Wire up the mapper to our Transport via virtual (in-memory) mode:
			// - When Transport sends a command, forward it to the mapper
			// - When the mapper sends a response/event, feed it into Transport
			cdpConn.onBidiMessage((msg: string) => {
				transport.receiveMessage(msg);
			});

			transport.connectVirtual(
				(msg: string) => cdpConn.sendBidiMessage(msg),
				() => cdpConn.close(),
			);
		}

		// Create a BiDi session
		const result = await asResult<SessionNewResult>(
			transport.send('session.new', { capabilities: {} }),
		);

		session.sessionId = result.sessionId;

		return session;
	}

	/**
	 * Connect to an already-running browser at the given WebSocket URL.
	 * Useful for connecting to remote browsers or CI setups.
	 */
	static async connect(wsEndpoint: string, options: TransportOptions = {}): Promise<BiDiSession> {
		const transport = new Transport(options);
		const session = new BiDiSession(transport);

		await transport.connect(wsEndpoint);

		const result = await asResult<SessionNewResult>(
			transport.send('session.new', { capabilities: {} }),
		);

		session.sessionId = result.sessionId;

		return session;
	}

	/** Subscribe to BiDi events */
	async subscribe(events: string[], contexts?: string[]): Promise<void> {
		const params: Record<string, unknown> = { events };
		if (contexts) params.contexts = contexts;
		await this.transport.send('session.subscribe', params);
	}

	/** Unsubscribe from BiDi events */
	async unsubscribe(events: string[], contexts?: string[]): Promise<void> {
		const params: Record<string, unknown> = { events };
		if (contexts) params.contexts = contexts;
		await this.transport.send('session.unsubscribe', params);
	}

	/** Listen for a specific event */
	on(eventName: string, handler: EventHandler): () => void {
		return this.transport.on(eventName, handler);
	}

	/** Wait for a specific event */
	async waitForEvent(
		eventName: string,
		predicate?: (event: BiDiEvent) => boolean,
		timeout?: number,
	): Promise<BiDiEvent> {
		return this.transport.waitForEvent(eventName, predicate, timeout);
	}

	/** Send a raw BiDi command (escape hatch for advanced users) */
	async send(
		method: string,
		params: Record<string, unknown> = {},
	): Promise<Record<string, unknown>> {
		return this.transport.send(method, params);
	}

	/** Whether the session is connected */
	get isConnected(): boolean {
		return this.transport.isConnected;
	}

	/** Close the session, kill the browser, clean up */
	async close(): Promise<void> {
		try {
			if (this.transport.isConnected) {
				await this.transport.send('session.end', {}).catch(() => {});
			}
		} finally {
			await this.transport.close();
			// The virtual close handler already calls cdpConnection.close(),
			// but if something went wrong, clean up explicitly too
			try {
				this.cdpConnection?.close();
			} catch {
				// ignore
			}
			await this.launchResult?.close();
		}
	}
}

// ---------------------------------------------------------------------------
// Module: browsingContext
// ---------------------------------------------------------------------------

class BrowsingContextModule {
	constructor(private transport: Transport) {}

	/** Create a new tab or window */
	async create(params: BrowsingContextCreateParams): Promise<BrowsingContextCreateResult> {
		return asResult(this.transport.send('browsingContext.create', toParams(params)));
	}

	/** Navigate to a URL */
	async navigate(params: BrowsingContextNavigateParams): Promise<BrowsingContextNavigateResult> {
		return asResult(this.transport.send('browsingContext.navigate', toParams(params)));
	}

	/** Get the browsing context tree */
	async getTree(params?: {
		maxDepth?: number;
		root?: string;
	}): Promise<BrowsingContextGetTreeResult> {
		return asResult(this.transport.send('browsingContext.getTree', params ? toParams(params) : {}));
	}

	/** Close a browsing context */
	async close(params: BrowsingContextCloseParams): Promise<void> {
		await this.transport.send('browsingContext.close', toParams(params));
	}

	/** Activate (focus) a browsing context */
	async activate(params: { context: string }): Promise<void> {
		await this.transport.send('browsingContext.activate', toParams(params));
	}

	/** Reload the current page */
	async reload(params: BrowsingContextReloadParams): Promise<BrowsingContextNavigateResult> {
		return asResult(this.transport.send('browsingContext.reload', toParams(params)));
	}

	/** Take a screenshot */
	async captureScreenshot(
		params: BrowsingContextCaptureScreenshotParams,
	): Promise<BrowsingContextCaptureScreenshotResult> {
		return asResult(this.transport.send('browsingContext.captureScreenshot', toParams(params)));
	}

	/** Set the viewport size */
	async setViewport(params: BrowsingContextSetViewportParams): Promise<void> {
		await this.transport.send('browsingContext.setViewport', toParams(params));
	}

	/** Find elements in the page */
	async locateNodes(
		params: BrowsingContextLocateNodesParams,
	): Promise<BrowsingContextLocateNodesResult> {
		return asResult(this.transport.send('browsingContext.locateNodes', toParams(params)));
	}

	/** Handle a dialog (alert, confirm, prompt) */
	async handleUserPrompt(params: BrowsingContextHandleUserPromptParams): Promise<void> {
		await this.transport.send('browsingContext.handleUserPrompt', toParams(params));
	}

	/** Navigate forward/backward in history (delta: -1 = back, +1 = forward) */
	async traverseHistory(params: BrowsingContextTraverseHistoryParams): Promise<void> {
		await this.transport.send('browsingContext.traverseHistory', toParams(params));
	}
}

// ---------------------------------------------------------------------------
// Module: script
// ---------------------------------------------------------------------------

class ScriptModule {
	constructor(private transport: Transport) {}

	/** Evaluate a JavaScript expression in a browsing context */
	async evaluate(params: ScriptEvaluateParams): Promise<ScriptEvaluateResult> {
		return asResult(this.transport.send('script.evaluate', toParams(params)));
	}

	/** Call a function in a browsing context */
	async callFunction(params: ScriptCallFunctionParams): Promise<ScriptEvaluateResult> {
		return asResult(this.transport.send('script.callFunction', toParams(params)));
	}

	/** Add a preload script that runs before any page script */
	async addPreloadScript(
		params: ScriptAddPreloadScriptParams,
	): Promise<ScriptAddPreloadScriptResult> {
		return asResult(this.transport.send('script.addPreloadScript', toParams(params)));
	}

	/** Remove a preload script */
	async removePreloadScript(params: ScriptRemovePreloadScriptParams): Promise<void> {
		await this.transport.send('script.removePreloadScript', toParams(params));
	}
}

// ---------------------------------------------------------------------------
// Module: network
// ---------------------------------------------------------------------------

class NetworkModule {
	constructor(private transport: Transport) {}

	/** Add a network intercept */
	async addIntercept(params: NetworkAddInterceptParams): Promise<NetworkAddInterceptResult> {
		return asResult(this.transport.send('network.addIntercept', toParams(params)));
	}

	/** Remove a network intercept */
	async removeIntercept(params: { intercept: string }): Promise<void> {
		await this.transport.send('network.removeIntercept', toParams(params));
	}

	/** Continue a blocked request (optionally modifying it) */
	async continueRequest(params: NetworkContinueRequestParams): Promise<void> {
		await this.transport.send('network.continueRequest', toParams(params));
	}

	/** Provide a synthetic response for a blocked request */
	async provideResponse(params: NetworkProvideResponseParams): Promise<void> {
		await this.transport.send('network.provideResponse', toParams(params));
	}

	/** Fail a blocked request with a network error */
	async failRequest(params: NetworkFailRequestParams): Promise<void> {
		await this.transport.send('network.failRequest', toParams(params));
	}

	/** Continue a blocked response (optionally modifying headers/status) */
	async continueResponse(params: NetworkContinueResponseParams): Promise<void> {
		await this.transport.send('network.continueResponse', toParams(params));
	}

	/** Continue with auth credentials for an auth challenge */
	async continueWithAuth(params: NetworkContinueWithAuthParams): Promise<void> {
		await this.transport.send('network.continueWithAuth', toParams(params));
	}
}

// ---------------------------------------------------------------------------
// Module: input
// ---------------------------------------------------------------------------

class InputModule {
	constructor(private transport: Transport) {}

	/** Perform a sequence of input actions (keyboard, mouse, touch) */
	async performActions(params: InputPerformActionsParams): Promise<void> {
		await this.transport.send('input.performActions', toParams(params));
	}

	/** Release all pressed keys and buttons */
	async releaseActions(params: InputReleaseActionsParams): Promise<void> {
		await this.transport.send('input.releaseActions', toParams(params));
	}

	/** Set files for a file input element */
	async setFiles(params: InputSetFilesParams): Promise<void> {
		await this.transport.send('input.setFiles', toParams(params));
	}
}

// ---------------------------------------------------------------------------
// Module: storage
// ---------------------------------------------------------------------------

class StorageModule {
	constructor(private transport: Transport) {}

	/** Get cookies matching optional filter */
	async getCookies(params?: StorageGetCookiesParams): Promise<StorageGetCookiesResult> {
		return asResult(this.transport.send('storage.getCookies', params ? toParams(params) : {}));
	}

	/** Set a cookie */
	async setCookie(params: StorageSetCookieParams): Promise<StorageSetCookieResult> {
		return asResult(this.transport.send('storage.setCookie', toParams(params)));
	}

	/** Delete cookies matching optional filter */
	async deleteCookies(params?: StorageDeleteCookiesParams): Promise<StorageDeleteCookiesResult> {
		return asResult(this.transport.send('storage.deleteCookies', params ? toParams(params) : {}));
	}
}
