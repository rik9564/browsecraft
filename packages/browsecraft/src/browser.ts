// ============================================================================
// Browsecraft - Browser Class
// Manages a browser instance. Creates pages. Handles lifecycle.
// ============================================================================

import {
	BiDiSession,
	type BrowsingContextCreateParams,
	type SessionOptions,
} from 'browsecraft-bidi';
import { type BrowsecraftConfig, type UserConfig, resolveConfig } from './config.js';
import { Page } from './page.js';

// ---------------------------------------------------------------------------
// Shared viewport setup helper (used by both Browser and BrowserContext)
// ---------------------------------------------------------------------------

/**
 * Configure the viewport for a newly created browsing context.
 *
 * - Headless: uses BiDi setViewport (device metrics emulation).
 * - Headed: uses window.resizeTo() to avoid gray dead-space from emulation.
 * - Maximized: skips all resizing — the browser is already full screen.
 */
async function applyViewport(
	session: BiDiSession,
	contextId: string,
	config: BrowsecraftConfig,
): Promise<void> {
	if (config.maximized && !config.headless) {
		// Maximized — browser fills the screen, no resizing needed
		return;
	}

	if (config.headless) {
		try {
			await session.browsingContext.setViewport({
				context: contextId,
				viewport: config.viewport,
			});
		} catch {
			// Some browsers/versions may not support setViewport
		}
		return;
	}

	// Headed mode: use CDP to resize & center the window at the OS level.
	// JS window.resizeTo/moveTo are restricted in Chrome for main windows.
	try {
		const { width, height } = config.viewport;

		// 1. Get screen dimensions via JS (screen.width/height are always readable)
		const screenInfo = await session.script.callFunction({
			functionDeclaration: `function(targetW, targetH) {
				const chromeW = window.outerWidth - window.innerWidth;
				const chromeH = window.outerHeight - window.innerHeight;
				return {
					screenW: screen.width,
					screenH: screen.height,
					outerW: targetW + chromeW,
					outerH: targetH + chromeH,
				};
			}`,
			target: { context: contextId },
			arguments: [
				{ type: 'number', value: width },
				{ type: 'number', value: height },
			],
			awaitPromise: false,
			resultOwnership: 'none',
		});

		// 2. Extract dimensions from the BiDi result
		let screenW = 1920;
		let screenH = 1080;
		let outerW = width + 16;
		let outerH = height + 88;

		const rv = screenInfo?.result;
		if (rv && 'value' in rv && rv.value && Array.isArray(rv.value)) {
			for (const entry of rv.value) {
				const kv = entry as [{ value: string }, { value: number }];
				if (kv[0]?.value === 'screenW') screenW = kv[1]?.value ?? screenW;
				if (kv[0]?.value === 'screenH') screenH = kv[1]?.value ?? screenH;
				if (kv[0]?.value === 'outerW') outerW = kv[1]?.value ?? outerW;
				if (kv[0]?.value === 'outerH') outerH = kv[1]?.value ?? outerH;
			}
		}

		// 3. Calculate centered position
		const left = Math.max(Math.round((screenW - outerW) / 2), 0);
		const top = Math.max(Math.round((screenH - outerH) / 2), 0);

		// 4. Use CDP to get the window ID and set bounds (OS-level positioning)
		try {
			const windowResult = await session.sendCdpCommand('Browser.getWindowForTarget', {
				targetId: contextId,
			});
			const windowId = windowResult.windowId as number;
			await session.sendCdpCommand('Browser.setWindowBounds', {
				windowId,
				bounds: { left, top, width: outerW, height: outerH },
			});
		} catch {
			// CDP positioning failed — try JS fallback
			await session.script.callFunction({
				functionDeclaration: `function(w, h, l, t) {
					window.resizeTo(w, h);
					window.moveTo(l, t);
				}`,
				target: { context: contextId },
				arguments: [
					{ type: 'number', value: outerW },
					{ type: 'number', value: outerH },
					{ type: 'number', value: left },
					{ type: 'number', value: top },
				],
				awaitPromise: false,
			});
		}
	} catch {
		// Fallback to setViewport if everything fails
		try {
			await session.browsingContext.setViewport({
				context: contextId,
				viewport: config.viewport,
			});
		} catch {
			// Continue anyway
		}
	}
}

// ---------------------------------------------------------------------------
// Browser
// ---------------------------------------------------------------------------

/**
 * Browser represents a running browser instance.
 * Use `Browser.launch()` to start one, or let the test() fixtures do it for you.
 *
 * ```ts
 * const browser = await Browser.launch();
 * const page = await browser.newPage();
 * await page.goto('https://example.com');
 * await browser.close();
 * ```
 */
export class Browser {
	/** @internal */
	readonly session: BiDiSession;
	/** @internal */
	private config: BrowsecraftConfig;
	/** @internal */
	private pages: Page[] = [];

	private constructor(session: BiDiSession, config: BrowsecraftConfig) {
		this.session = session;
		this.config = config;
	}

	/**
	 * Launch a new browser instance.
	 *
	 * ```ts
	 * const browser = await Browser.launch(); // Chrome, headless
	 * const browser = await Browser.launch({ browser: 'firefox', headless: false });
	 * ```
	 */
	static async launch(userConfig?: UserConfig): Promise<Browser> {
		const config = resolveConfig(userConfig);

		const sessionOptions: SessionOptions = {
			browser: config.browser,
			headless: config.headless,
			executablePath: config.executablePath,
			debug: config.debug,
			timeout: config.timeout,
			maximized: config.maximized,
		};

		const session = await BiDiSession.launch(sessionOptions);
		const browser = new Browser(session, config);

		return browser;
	}

	/**
	 * Connect to an already-running browser.
	 *
	 * ```ts
	 * const browser = await Browser.connect('ws://localhost:9222/session');
	 * ```
	 */
	static async connect(wsEndpoint: string, userConfig?: UserConfig): Promise<Browser> {
		const config = resolveConfig(userConfig);
		const session = await BiDiSession.connect(wsEndpoint);
		return new Browser(session, config);
	}

	/**
	 * Create a new page (tab).
	 * If an idle about:blank tab exists (e.g., Chrome's initial tab), it is
	 * reused instead of creating a new one. This prevents the "double window"
	 * issue in headed mode.
	 *
	 * ```ts
	 * const page = await browser.newPage();
	 * await page.goto('https://example.com');
	 * ```
	 */
	async newPage(): Promise<Page> {
		let contextId: string;

		// Try to reuse the initial about:blank tab to avoid double windows in headed mode
		const reused = await this.tryReuseInitialTab();
		if (reused) {
			contextId = reused;
		} else {
			const result = await this.session.browsingContext.create({ type: 'tab' });
			contextId = result.context;
		}

		await applyViewport(this.session, contextId, this.config);

		const page = new Page(this.session, contextId, this.config);
		this.pages.push(page);

		// Clean up pages array when context is destroyed
		this.session.on('browsingContext.closed', (event) => {
			const params = event.params as { context?: string };
			if (params.context === contextId) {
				const idx = this.pages.indexOf(page);
				if (idx !== -1) this.pages.splice(idx, 1);
			}
		});

		return page;
	}

	/** Get all open pages. */
	get openPages(): Page[] {
		return [...this.pages];
	}

	/**
	 * Create an isolated browser context (like incognito).
	 * Returns a BrowserContext that can create its own pages.
	 */
	async newContext(): Promise<BrowserContext> {
		// Capture the cleanup fn so the context can call it after creating its
		// first page.  We must NOT close orphan tabs here — Chrome needs at
		// least one open window/tab to be able to create new targets.  Closing
		// all blank tabs before the new page is opened leaves Chrome windowless
		// and causes "Failed to open a new tab" errors.
		const cleanupFn = () => this.closeOrphanBlankTabs();

		try {
			const result = await this.session.send('browser.createUserContext', {});
			const userContext = (result as { userContext: string }).userContext;

			return new BrowserContext(this.session, this.config, userContext, cleanupFn);
		} catch (err) {
			console.warn(
				`[browsecraft] Warning: browser.createUserContext is not supported. Pages will share cookies/storage. ${err instanceof Error ? err.message : String(err)}`,
			);
			return new BrowserContext(this.session, this.config, null, cleanupFn);
		}
	}

	/** Close the browser and clean up all resources. */
	async close(): Promise<void> {
		for (const page of this.pages) {
			await page.close().catch(() => {});
		}
		this.pages = [];
		await this.session.close();
	}

	/** Whether the browser is still connected */
	get isConnected(): boolean {
		return this.session.isConnected;
	}

	/** Get the resolved config */
	getConfig(): BrowsecraftConfig {
		return { ...this.config };
	}

	/**
	 * Close any about:blank tabs in the default user context that aren't tracked
	 * as pages.  Chrome (and some other browsers) always opens with an initial
	 * blank tab.  When we create an isolated context, that tab can't be reused
	 * (wrong context) and just sits there as a ghost window.  This method cleans
	 * it up.
	 *
	 * Only tabs whose `userContext` is `"default"` (or missing) are considered —
	 * newly created pages in a custom user context also start at `about:blank`
	 * and must NOT be closed.
	 * @internal
	 */
	private async closeOrphanBlankTabs(): Promise<void> {
		try {
			const tree = await this.session.browsingContext.getTree();
			const contexts = tree.contexts ?? [];
			for (const ctx of contexts) {
				const alreadyTracked = this.pages.some((p) => p.contextId === ctx.context);
				const isDefaultContext = !ctx.userContext || ctx.userContext === 'default';
				if (!alreadyTracked && ctx.url === 'about:blank' && isDefaultContext) {
					await this.session.browsingContext.close({ context: ctx.context }).catch(() => {});
				}
			}
		} catch {
			// getTree or close not supported — ignore
		}
	}

	/**
	 * Try to find and reuse an existing about:blank tab (Chrome opens one on startup).
	 * Returns the context ID if found, or null if no idle tab exists.
	 * @internal
	 */
	private async tryReuseInitialTab(): Promise<string | null> {
		try {
			const tree = await this.session.browsingContext.getTree();
			const contexts = tree.contexts ?? [];
			for (const ctx of contexts) {
				// Only reuse tabs we haven't already wrapped as a Page
				const alreadyTracked = this.pages.some((p) => p.contextId === ctx.context);
				if (!alreadyTracked && ctx.url === 'about:blank') {
					return ctx.context;
				}
			}
		} catch {
			// getTree not supported — fall through to create
		}
		return null;
	}
}

// ---------------------------------------------------------------------------
// BrowserContext -- isolated context (like incognito mode)
// ---------------------------------------------------------------------------

/**
 * An isolated browser context. Pages created in different contexts
 * don't share cookies, storage, or cache.
 */
export class BrowserContext {
	/** @internal */
	private session: BiDiSession;
	/** @internal */
	private config: BrowsecraftConfig;
	/** @internal */
	private userContext: string | null;
	/** @internal */
	private pages: Page[] = [];
	/** @internal — called once after the first page is created to clean up orphan blank tabs */
	private pendingCleanup: (() => Promise<void>) | null;

	constructor(
		session: BiDiSession,
		config: BrowsecraftConfig,
		userContext: string | null,
		cleanupFn?: () => Promise<void>,
	) {
		this.session = session;
		this.config = config;
		this.userContext = userContext;
		this.pendingCleanup = cleanupFn ?? null;
	}

	/** Create a new page in this context. */
	async newPage(): Promise<Page> {
		const params: BrowsingContextCreateParams = {
			type: 'tab',
			...(this.userContext ? { userContext: this.userContext } : {}),
		};

		const result = await this.session.browsingContext.create(params);
		const contextId = result.context;

		// Now that a new tab exists in the new context, it's safe to close
		// orphan about:blank tabs from the default context.
		if (this.pendingCleanup) {
			await this.pendingCleanup();
			this.pendingCleanup = null;
		}

		await applyViewport(this.session, contextId, this.config);

		const page = new Page(this.session, contextId, this.config);
		this.pages.push(page);
		return page;
	}

	/** Close this context and all its pages. */
	async close(): Promise<void> {
		for (const page of this.pages) {
			await page.close().catch(() => {});
		}
		this.pages = [];

		if (this.userContext) {
			await this.session
				.send('browser.removeUserContext', {
					userContext: this.userContext,
				})
				.catch(() => {});
		}
	}
}
