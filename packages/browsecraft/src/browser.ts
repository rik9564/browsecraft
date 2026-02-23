// ============================================================================
// Browsecraft - Browser Class
// Manages a browser instance. Creates pages. Handles lifecycle.
// ============================================================================

import { BiDiSession, type SessionOptions } from 'browsecraft-bidi';
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

	// Headed mode: resize the outer window so its natural content area
	// matches the desired viewport (avoids device emulation artifacts).
	try {
		const { width, height } = config.viewport;
		await session.script.callFunction({
			functionDeclaration: `function(targetW, targetH) {
				const chromeW = window.outerWidth - window.innerWidth;
				const chromeH = window.outerHeight - window.innerHeight;
				window.resizeTo(targetW + chromeW, targetH + chromeH);
			}`,
			target: { context: contextId },
			arguments: [
				{ type: 'number', value: width },
				{ type: 'number', value: height },
			],
			awaitPromise: false,
		});
	} catch {
		// Fallback to setViewport if resizeTo fails
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
		try {
			const result = await this.session.send('browser.createUserContext', {});
			const userContext = (result as { userContext: string }).userContext;

			// Close Chrome's initial about:blank tab — it belongs to the default
			// context and can't be reused inside the new isolated context, so it
			// just lingers as a ghost window.
			await this.closeOrphanBlankTabs();

			return new BrowserContext(this.session, this.config, userContext);
		} catch (err) {
			console.warn(
				`[browsecraft] Warning: browser.createUserContext is not supported. Pages will share cookies/storage. ${err instanceof Error ? err.message : String(err)}`,
			);
			// Still clean up blank tabs even in fallback mode
			await this.closeOrphanBlankTabs();
			return new BrowserContext(this.session, this.config, null);
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
	 * Close any about:blank tabs that aren't tracked as pages.
	 * Chrome (and some other browsers) always opens with an initial blank tab.
	 * When we create an isolated context, that tab can't be reused (wrong context)
	 * and just sits there as a ghost window. This method cleans it up.
	 * @internal
	 */
	private async closeOrphanBlankTabs(): Promise<void> {
		try {
			const tree = await this.session.browsingContext.getTree();
			const contexts = tree.contexts ?? [];
			for (const ctx of contexts) {
				const alreadyTracked = this.pages.some(
					(p) => (p as any).contextId === ctx.context,
				);
				if (!alreadyTracked && ctx.url === 'about:blank') {
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
				const alreadyTracked = this.pages.some((p) => (p as any).contextId === ctx.context);
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

	constructor(session: BiDiSession, config: BrowsecraftConfig, userContext: string | null) {
		this.session = session;
		this.config = config;
		this.userContext = userContext;
	}

	/** Create a new page in this context. */
	async newPage(): Promise<Page> {
		const params: Record<string, unknown> = { type: 'tab' };
		if (this.userContext) {
			params.userContext = this.userContext;
		}

		const result = await this.session.browsingContext.create(params as any);
		const contextId = result.context;

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
