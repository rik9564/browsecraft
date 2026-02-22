// ============================================================================
// Browsecraft BiDi - Browser Launcher
// Finds and launches browsers (Chrome, Firefox, Edge) with BiDi support.
// Zero config -- auto-detects installed browsers on Windows, Mac, Linux.
// ============================================================================

import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Supported browser names */
export type BrowserName = 'chrome' | 'firefox' | 'edge';

/** Options for launching a browser */
export interface LaunchOptions {
	/** Which browser to launch (default: 'chrome') */
	browser?: BrowserName;
	/** Run in headless mode (default: true) */
	headless?: boolean;
	/** Custom browser executable path */
	executablePath?: string;
	/** Extra args to pass to the browser process */
	args?: string[];
	/** Start the browser window maximized (headed mode only, default: false) */
	maximized?: boolean;
	/** Timeout for browser startup in ms (default: 30000) */
	timeout?: number;
}

/** Result of launching a browser */
export interface LaunchResult {
	/** The WebSocket URL to connect BiDi to */
	wsEndpoint: string;
	/** The browser process */
	process: ChildProcess;
	/** Path to the temporary user data directory */
	userDataDir: string;
	/** Clean up: kill process and remove temp dir */
	close: () => Promise<void>;
}

/**
 * Launch a browser and return its BiDi WebSocket endpoint.
 *
 * Usage:
 * ```ts
 * const { wsEndpoint, close } = await launchBrowser({ browser: 'chrome' });
 * // connect to wsEndpoint...
 * await close(); // clean up
 * ```
 */
export async function launchBrowser(options: LaunchOptions = {}): Promise<LaunchResult> {
	const { browser = 'chrome', headless = true, timeout = 30_000 } = options;

	// Create a temporary user data dir so we get a clean profile every time
	const userDataDir = await mkdtemp(join(tmpdir(), `browsecraft-${browser}-`));

	const executablePath = options.executablePath ?? findBrowser(browser);
	if (!executablePath) {
		throw new Error(
			`Could not find ${browser} on your system. ` +
				`Install ${browser} or provide executablePath in options.`,
		);
	}

	const args = buildArgs(browser, {
		headless,
		userDataDir,
		maximized: options.maximized,
		extraArgs: options.args,
	});

	const proc = spawn(executablePath, args, {
		stdio: ['pipe', 'pipe', 'pipe'],
		detached: false,
	});

	try {
		const wsEndpoint = await waitForWSEndpoint(proc, browser, timeout);

		const close = async () => {
			if (!proc.killed) {
				proc.kill('SIGTERM');
				// Give it 3s to die gracefully, then force kill
				await new Promise<void>((resolve) => {
					const forceTimer = setTimeout(() => {
						if (!proc.killed) proc.kill('SIGKILL');
						resolve();
					}, 3000);
					proc.on('exit', () => {
						clearTimeout(forceTimer);
						resolve();
					});
				});
			}
			// Clean up temp profile
			await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
		};

		return { wsEndpoint, process: proc, userDataDir, close };
	} catch (err) {
		// If startup fails, clean up
		proc.kill('SIGKILL');
		await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
		throw err;
	}
}

// ---------------------------------------------------------------------------
// Browser discovery - finds where the browser is installed
// ---------------------------------------------------------------------------

function findBrowser(browser: BrowserName): string | null {
	const platform = process.platform;

	const paths = getBrowserPaths(browser, platform);
	for (const p of paths) {
		if (existsSync(p)) return p;
	}

	return null;
}

function getBrowserPaths(browser: BrowserName, platform: string): string[] {
	switch (browser) {
		case 'chrome':
			return getChromePaths(platform);
		case 'firefox':
			return getFirefoxPaths(platform);
		case 'edge':
			return getEdgePaths(platform);
		default:
			return [];
	}
}

function getChromePaths(platform: string): string[] {
	switch (platform) {
		case 'win32':
			return [
				'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
				'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
				`${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
			];
		case 'darwin':
			return [
				'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
				`${process.env.HOME}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
			];
		case 'linux':
			return [
				'/usr/bin/google-chrome',
				'/usr/bin/google-chrome-stable',
				'/usr/bin/chromium',
				'/usr/bin/chromium-browser',
				'/snap/bin/chromium',
			];
		default:
			return [];
	}
}

function getFirefoxPaths(platform: string): string[] {
	switch (platform) {
		case 'win32':
			return [
				'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
				'C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe',
			];
		case 'darwin':
			return [
				'/Applications/Firefox.app/Contents/MacOS/firefox',
				`${process.env.HOME}/Applications/Firefox.app/Contents/MacOS/firefox`,
			];
		case 'linux':
			return ['/usr/bin/firefox', '/usr/bin/firefox-esr', '/snap/bin/firefox'];
		default:
			return [];
	}
}

function getEdgePaths(platform: string): string[] {
	switch (platform) {
		case 'win32':
			return [
				'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
				'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
				`${process.env.LOCALAPPDATA}\\Microsoft\\Edge\\Application\\msedge.exe`,
			];
		case 'darwin':
			return ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'];
		case 'linux':
			return ['/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable'];
		default:
			return [];
	}
}

// ---------------------------------------------------------------------------
// Browser args - construct the right CLI flags
// ---------------------------------------------------------------------------

interface BuildArgsOptions {
	headless: boolean;
	userDataDir: string;
	maximized?: boolean;
	extraArgs?: string[];
}

function buildArgs(browser: BrowserName, options: BuildArgsOptions): string[] {
	switch (browser) {
		case 'chrome':
		case 'edge':
			return buildChromiumArgs(options);
		case 'firefox':
			return buildFirefoxArgs(options);
		default:
			return [];
	}
}

function buildChromiumArgs(options: BuildArgsOptions): string[] {
	const args = [
		// Enable BiDi -- Chrome exposes BiDi on the same debugging port
		'--remote-debugging-port=0', // 0 = auto-pick a free port
		`--user-data-dir=${options.userDataDir}`,

		// Stability flags
		'--no-first-run',
		'--no-default-browser-check',
		'--disable-background-networking',
		'--disable-background-timer-throttling',
		'--disable-backgrounding-occluded-windows',
		'--disable-breakpad',
		'--disable-component-update',
		'--disable-default-apps',
		'--disable-dev-shm-usage',
		'--disable-extensions',
		'--disable-hang-monitor',
		'--disable-ipc-flooding-protection',
		'--disable-popup-blocking',
		'--disable-prompt-on-repost',
		'--disable-renderer-backgrounding',
		'--disable-sync',
		'--disable-translate',
		'--metrics-recording-only',
		'--no-startup-window',
		'--password-store=basic',
		'--use-mock-keychain',
		'--force-color-profile=srgb',

		// Open about:blank initially (fast, no network)
		'about:blank',
	];

	if (options.headless) {
		args.unshift('--headless=new');
	} else {
		// In headed mode, set a sensible window size so the viewport fits properly
		// and content is aligned. Without this, Chrome may open with a tiny default
		// window causing elements to render outside the visible area.
		if (options.maximized) {
			args.unshift('--start-maximized');
		} else {
			// Extra pixels account for Chrome's UI chrome (toolbar, tabs, etc.)
			args.unshift('--window-size=1366,868');
		}
	}

	// --no-startup-window is needed for headless; in headed mode it prevents
	// the window from appearing until a browsing context is created via BiDi
	if (!options.headless) {
		const idx = args.indexOf('--no-startup-window');
		if (idx !== -1) args.splice(idx, 1);
	}

	if (options.extraArgs) {
		args.push(...options.extraArgs);
	}

	return args;
}

function buildFirefoxArgs(options: BuildArgsOptions): string[] {
	const args = [
		'--remote-debugging-port',
		'0',
		'-profile',
		options.userDataDir,
		'-no-remote',
		'about:blank',
	];

	if (options.headless) {
		args.unshift('-headless');
	}

	if (options.extraArgs) {
		args.push(...options.extraArgs);
	}

	return args;
}

// ---------------------------------------------------------------------------
// Wait for the browser to output its WebSocket endpoint
// ---------------------------------------------------------------------------

function waitForWSEndpoint(
	proc: ChildProcess,
	browser: BrowserName,
	timeout: number,
): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		let stderr = '';

		const timer = setTimeout(() => {
			reject(
				new Error(
					`Timed out after ${timeout}ms waiting for ${browser} to start.\n` +
						`Stderr output:\n${stderr}`,
				),
			);
		}, timeout);

		const onData = (data: Buffer) => {
			const chunk = data.toString('utf-8');
			stderr += chunk;

			// Chrome/Edge: "DevTools listening on ws://127.0.0.1:PORT/devtools/browser/GUID"
			const wsMatch = chunk.match(/DevTools listening on (ws:\/\/.+)/);
			if (wsMatch?.[1]) {
				clearTimeout(timer);
				proc.stderr?.off('data', onData);
				resolve(wsMatch[1]);
				return;
			}

			// Firefox: "WebDriver BiDi listening on ws://127.0.0.1:PORT"
			const firefoxMatch = chunk.match(/WebDriver BiDi listening on (ws:\/\/.+)/);
			if (firefoxMatch?.[1]) {
				clearTimeout(timer);
				proc.stderr?.off('data', onData);
				resolve(firefoxMatch[1]);
				return;
			}
		};

		proc.stderr?.on('data', onData);

		proc.on('exit', (code) => {
			clearTimeout(timer);
			reject(
				new Error(
					`${browser} exited with code ${code} before WebSocket endpoint was ready.\n` +
						`Stderr:\n${stderr}`,
				),
			);
		});

		proc.on('error', (err) => {
			clearTimeout(timer);
			reject(new Error(`Failed to launch ${browser}: ${err.message}`));
		});
	});
}
