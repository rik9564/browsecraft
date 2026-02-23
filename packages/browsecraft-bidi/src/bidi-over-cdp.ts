// ============================================================================
// Browsecraft BiDi - BiDi over CDP
// For Chrome/Edge: connects via CDP, runs the chromium-bidi mapper in-process
// to translate BiDi <-> CDP. Firefox connects directly (native BiDi).
// ============================================================================

import { WebSocket } from 'ws';

/**
 * Result of setting up BiDi over CDP.
 * Provides functions to send/receive BiDi messages as JSON strings,
 * matching the interface our Transport class expects.
 */
export interface BidiOverCdpConnection {
	/** Send a BiDi command (as JSON string) into the mapper */
	sendBidiMessage: (message: string) => void;
	/** Register handler for BiDi response/event messages (as JSON string) */
	onBidiMessage: (handler: (message: string) => void) => void;
	/** Close everything */
	close: () => void;
	/** Send a raw CDP command (e.g., Browser.setWindowBounds) bypassing BiDi */
	sendCdpCommand: (
		method: string,
		params?: Record<string, unknown>,
	) => Promise<Record<string, unknown>>;
}

/**
 * Connect to a Chrome/Edge browser via CDP and set up the chromium-bidi mapper
 * to translate BiDi commands to CDP and back.
 *
 * @param cdpWsEndpoint - The CDP WebSocket URL (e.g., ws://localhost:9222/devtools/browser/GUID)
 * @param debug - Enable debug logging
 * @returns A BidiOverCdpConnection that speaks BiDi via JSON strings
 */
export async function connectBidiOverCdp(
	cdpWsEndpoint: string,
	debug = false,
): Promise<BidiOverCdpConnection> {
	// 1. Connect to Chrome's CDP WebSocket
	const ws = new WebSocket(cdpWsEndpoint);
	await new Promise<void>((resolve, reject) => {
		const timer = setTimeout(
			() => reject(new Error(`CDP connection timed out: ${cdpWsEndpoint}`)),
			30_000,
		);
		ws.on('open', () => {
			clearTimeout(timer);
			resolve();
		});
		ws.on('error', (err) => {
			clearTimeout(timer);
			reject(new Error(`CDP WebSocket error: ${err.message}`));
		});
	});

	// 2. Import chromium-bidi (lazy load — it's a heavy dependency)
	//    We use dynamic import() so the module is optional at the type level.
	const chromiumBidi = await import('chromium-bidi');
	const BidiServer = chromiumBidi.BidiMapper.BidiServer;

	// 3. Deep import the concrete MapperCdpConnection class
	//    (BidiMapper only exports it as a type, not the class itself)
	// biome-ignore lint/suspicious/noExplicitAny: dynamic import of untyped chromium-bidi internals
	const cdpConnectionModule = (await import('chromium-bidi/lib/cjs/cdp/CdpConnection.js')) as any;
	const MapperCdpConnection = cdpConnectionModule.MapperCdpConnection;

	// 4. Create the raw CDP transport (string-based, wraps our WebSocket)
	//    This matches chromium-bidi's Transport interface: { setOnMessage, sendMessage, close }
	let cdpOnMessage: ((message: string) => Promise<void> | void) | null = null;

	const cdpTransport = {
		setOnMessage(handler: (message: string) => Promise<void> | void) {
			cdpOnMessage = handler;
		},
		sendMessage(message: string) {
			if (ws.readyState === WebSocket.OPEN) {
				ws.send(message);
			}
		},
		close() {
			ws.close();
		},
	};

	// Wire up WebSocket messages to the CDP transport
	ws.on('message', (data: Buffer) => {
		const message = data.toString('utf-8');
		cdpOnMessage?.(message);
	});

	// 5. Create the CdpConnection (chromium-bidi's wrapper around raw CDP transport)
	const logger = debug
		? (type: string, ...messages: unknown[]) => console.log(`[${type}]`, ...messages)
		: undefined;

	const cdpConnection = new MapperCdpConnection(cdpTransport, logger);

	// 6. Create a browser-level CDP session
	const browserCdpClient = await cdpConnection.createBrowserSession();

	// 7. Create the BiDi transport adapter
	//    BidiTransport works with PARSED OBJECTS (not strings):
	//    - setOnMessage handler receives ChromiumBidi.Command objects
	//    - sendMessage receives ChromiumBidi.Message objects (responses/events)
	let bidiMessageHandler: ((message: string) => void) | null = null;
	let incomingCommandHandler: ((message: unknown) => Promise<void> | void) | null = null;

	const bidiTransport = {
		setOnMessage(handler: (message: unknown) => Promise<void> | void) {
			// BidiServer registers this handler to receive incoming BiDi commands
			incomingCommandHandler = handler;
		},
		sendMessage(message: unknown) {
			// BidiServer calls this with BiDi responses/events as parsed objects
			// We convert to JSON string for our Transport class
			const msgStr = typeof message === 'string' ? message : JSON.stringify(message);
			bidiMessageHandler?.(msgStr);
		},
		close() {
			// nothing to close on our side
		},
	};

	// 8. Create and start the BidiServer mapper
	const bidiServer = await BidiServer.createAndStart(
		// biome-ignore lint/suspicious/noExplicitAny: chromium-bidi BidiServer.createAndStart has no public transport type
		bidiTransport as any,
		cdpConnection,
		browserCdpClient,
		/* selfTargetId= */ '',
		undefined, // parser (use default)
		logger,
	);

	// 9. Build and return the connection interface
	return {
		sendBidiMessage(message: string) {
			// Parse the JSON string command and feed it to the BidiServer
			if (incomingCommandHandler) {
				try {
					const parsed = JSON.parse(message);
					incomingCommandHandler(parsed);
				} catch (err) {
					if (debug) {
						console.error('[BiDi-over-CDP] Failed to parse outgoing command:', err);
					}
				}
			}
		},

		onBidiMessage(handler: (message: string) => void) {
			bidiMessageHandler = handler;
		},

		close() {
			bidiServer.close();
			cdpTransport.close();
		},

		async sendCdpCommand(
			method: string,
			params: Record<string, unknown> = {},
		): Promise<Record<string, unknown>> {
			return browserCdpClient.sendCommand(method, params);
		},
	};
}
