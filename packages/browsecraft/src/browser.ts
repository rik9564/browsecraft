// ============================================================================
// Browsecraft - Browser Class
// Manages a browser instance. Creates pages. Handles lifecycle.
//
// const browser = await Browser.launch();
// const page = await browser.newPage();
// await page.goto('https://example.com');
// await browser.close();
// ============================================================================

import { BiDiSession, type SessionOptions } from 'browsecraft-bidi';
import { Page } from './page.js';
import { resolveConfig, type BrowsecraftConfig, type UserConfig } from './config.js';

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
		};

		const session = await BiDiSession.launch(sessionOptions);
		const browser = new Browser(session, config);

		// Set up default viewport on new contexts
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
	 *
	 * ```ts
	 * const page = await browser.newPage();
	 * await page.goto('https://example.com');
	 * ```
	 */
	async newPage(): Promise<Page> {
		// Create a new browsing context (tab)
		const result = await this.session.browsingContext.create({ type: 'tab' });
		const contextId = result.context;

		// Set viewport
		try {
			await this.session.browsingContext.setViewport({
				context: contextId,
				viewport: this.config.viewport,
			});
		} catch {
			// Some browsers/versions may not support setViewport -- continue anyway
		}

		const page = new Page(this.session, contextId, this.config);
		this.pages.push(page);

		// Listen for context destroyed events to clean up the pages array
		this.session.on('browsingContext.closed', (event) => {
			const params = event.params as { context?: string };
			if (params.context === contextId) {
				const idx = this.pages.indexOf(page);
				if (idx !== -1) {
					this.pages.splice(idx, 1);
				}
			}
		});

		return page;
	}

	/**
	 * Get all open pages.
	 */
	get openPages(): Page[] {
		return [...this.pages];
	}

	/**
	 * Create an isolated browser context (like incognito).
	 * Returns a BrowserContext that can create its own pages.
	 */
	async newContext(): Promise<BrowserContext> {
		// BiDi uses user contexts for isolation
		try {
			const result = await this.session.send('browser.createUserContext', {});
			const userContext = (result as { userContext: string }).userContext;
			return new BrowserContext(this.session, this.config, userContext);
		} catch (err) {
			// User contexts are not supported by all browser versions.
			// Warn the user and fall back to a non-isolated context.
			console.warn(
				'[browsecraft] Warning: browser.createUserContext is not supported. ' +
				'Pages will share cookies/storage. ' +
				(err instanceof Error ? err.message : String(err)),
			);
			return new BrowserContext(this.session, this.config, null);
		}
	}

	/**
	 * Close the browser and clean up all resources.
	 */
	async close(): Promise<void> {
		// Close all pages
		for (const page of this.pages) {
			await page.close().catch(() => {});
		}
		this.pages = [];

		// Close the session + kill the browser process
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

	/**
	 * Create a new page in this context.
	 */
	async newPage(): Promise<Page> {
		const params: Record<string, unknown> = { type: 'tab' };
		if (this.userContext) {
			params.userContext = this.userContext;
		}

		const result = await this.session.browsingContext.create(params as any);
		const contextId = result.context;

		// Set viewport
		try {
			await this.session.browsingContext.setViewport({
				context: contextId,
				viewport: this.config.viewport,
			});
		} catch {
			// Continue if viewport setting fails
		}

		const page = new Page(this.session, contextId, this.config);
		this.pages.push(page);
		return page;
	}

	/**
	 * Close this context and all its pages.
	 */
	async close(): Promise<void> {
		for (const page of this.pages) {
			await page.close().catch(() => {});
		}
		this.pages = [];

		if (this.userContext) {
			await this.session.send('browser.removeUserContext', {
				userContext: this.userContext,
			}).catch(() => {});
		}
	}
}
