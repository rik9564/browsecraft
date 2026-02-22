// ============================================================================
// Browsecraft BiDi - WebSocket Transport
// Low-level transport for BiDi communication.
// Supports two modes:
//   1. Direct WebSocket (Firefox native BiDi)
//   2. In-memory callback (Chrome/Edge via chromium-bidi mapper)
// ============================================================================

import { WebSocket } from 'ws';
import type { BiDiCommand, BiDiEvent, BiDiMessage } from './types.js';
import { BiDiError } from './types.js';

/** Callback for events pushed by the browser */
export type EventHandler = (event: BiDiEvent) => void;

/** Options for creating a transport connection */
export interface TransportOptions {
	/** Connection timeout in milliseconds (default: 30000) */
	timeout?: number;
	/** Called when the connection drops unexpectedly */
	onDisconnect?: (reason: string) => void;
	/** Called for every raw message (useful for debugging/tracing) */
	onRawMessage?: (direction: 'send' | 'receive', data: string) => void;
}

/** Tracks a pending command waiting for its response */
interface PendingCommand {
	resolve: (result: Record<string, unknown>) => void;
	reject: (error: BiDiError) => void;
	timer: ReturnType<typeof setTimeout>;
}

/**
 * The send function signature for the virtual (in-memory) transport mode.
 * The Transport calls this to deliver outgoing BiDi command JSON strings.
 */
export type VirtualSendFn = (message: string) => void;

/**
 * Transport manages communication with a browser's BiDi endpoint.
 *
 * It handles:
 * - Connecting to a BiDi WebSocket endpoint (Firefox), OR
 * - Using an in-memory callback pair (Chrome/Edge via chromium-bidi mapper)
 * - Sending commands and correlating responses by ID
 * - Dispatching events to registered handlers
 * - Timeout management for commands
 * - Clean shutdown
 */
export class Transport {
	private ws: WebSocket | null = null;
	private nextId = 0;
	private pending = new Map<number, PendingCommand>();
	private eventHandlers = new Map<string, Set<EventHandler>>();
	private globalEventHandlers = new Set<EventHandler>();
	private connected = false;
	private readonly timeout: number;
	private readonly onDisconnect?: (reason: string) => void;
	private readonly onRawMessage?: (direction: 'send' | 'receive', data: string) => void;

	// For virtual (in-memory) mode
	private virtualSend: VirtualSendFn | null = null;
	private virtualCloseFn: (() => void) | null = null;

	constructor(options: TransportOptions = {}) {
		this.timeout = options.timeout ?? 30_000;
		this.onDisconnect = options.onDisconnect;
		this.onRawMessage = options.onRawMessage;
	}

	/**
	 * Connect to a browser BiDi WebSocket endpoint (for Firefox native BiDi).
	 *
	 * @param url - WebSocket URL (e.g., "ws://localhost:9222/session")
	 * @returns Promise that resolves when the connection is open
	 */
	async connect(url: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			const timer = setTimeout(() => {
				reject(new BiDiError('session not created', `Connection to ${url} timed out after ${this.timeout}ms`));
			}, this.timeout);

			this.ws = new WebSocket(url);

			this.ws.on('open', () => {
				clearTimeout(timer);
				this.connected = true;
				resolve();
			});

			this.ws.on('message', (data: Buffer) => {
				const raw = data.toString('utf-8');
				this.onRawMessage?.('receive', raw);
				this.handleMessage(raw);
			});

			this.ws.on('error', (err: Error) => {
				clearTimeout(timer);
				if (!this.connected) {
					reject(new BiDiError('session not created', `WebSocket error: ${err.message}`));
				}
			});

			this.ws.on('close', (code: number, reason: Buffer) => {
				clearTimeout(timer);
				const wasConnected = this.connected;
				this.connected = false;

				// Reject all pending commands
				for (const [id, cmd] of this.pending) {
					cmd.reject(new BiDiError('unknown error', `Connection closed while waiting for command ${id}`));
					clearTimeout(cmd.timer);
				}
				this.pending.clear();

				if (wasConnected) {
					this.onDisconnect?.(reason.toString('utf-8') || `code ${code}`);
				} else {
					reject(new BiDiError('session not created', `WebSocket closed before connection established (code: ${code})`));
				}
			});
		});
	}

	/**
	 * Connect in virtual (in-memory) mode for BiDi-over-CDP.
	 * Instead of a WebSocket, messages are passed through callback functions.
	 *
	 * @param sendFn - Function to call when sending a BiDi command
	 * @param closeFn - Function to call on close
	 */
	connectVirtual(sendFn: VirtualSendFn, closeFn?: () => void): void {
		this.virtualSend = sendFn;
		this.virtualCloseFn = closeFn ?? null;
		this.connected = true;
	}

	/**
	 * Feed a BiDi response/event message into the transport (for virtual mode).
	 * The chromium-bidi mapper calls this when it has a response or event.
	 */
	receiveMessage(raw: string): void {
		this.onRawMessage?.('receive', raw);
		this.handleMessage(raw);
	}

	/**
	 * Send a BiDi command and wait for its response.
	 *
	 * @param method - BiDi method (e.g., "browsingContext.navigate")
	 * @param params - Command parameters
	 * @returns Promise resolving to the command result
	 */
	async send(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
		if (!this.connected) {
			throw new BiDiError('session not created', 'Not connected to browser');
		}

		const id = this.nextId++;

		const command: BiDiCommand = { id, method, params };
		const raw = JSON.stringify(command);

		return new Promise<Record<string, unknown>>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new BiDiError('unknown error', `Command "${method}" timed out after ${this.timeout}ms`));
			}, this.timeout);

			this.pending.set(id, { resolve, reject, timer });

			this.onRawMessage?.('send', raw);

			if (this.virtualSend) {
				// Virtual mode: pass to the mapper
				this.virtualSend(raw);
			} else if (this.ws) {
				// WebSocket mode: send over the wire
				this.ws.send(raw);
			}
		});
	}

	/**
	 * Subscribe to a specific BiDi event type.
	 *
	 * @param eventName - Event method (e.g., "browsingContext.load")
	 * @param handler - Callback function
	 * @returns Unsubscribe function
	 */
	on(eventName: string, handler: EventHandler): () => void {
		if (!this.eventHandlers.has(eventName)) {
			this.eventHandlers.set(eventName, new Set());
		}
		this.eventHandlers.get(eventName)!.add(handler);

		return () => {
			this.eventHandlers.get(eventName)?.delete(handler);
		};
	}

	/**
	 * Subscribe to ALL events (useful for tracing/debugging).
	 *
	 * @param handler - Callback function
	 * @returns Unsubscribe function
	 */
	onAnyEvent(handler: EventHandler): () => void {
		this.globalEventHandlers.add(handler);
		return () => {
			this.globalEventHandlers.delete(handler);
		};
	}

	/**
	 * Wait for a specific event to occur (one-time).
	 *
	 * @param eventName - Event method to wait for
	 * @param predicate - Optional filter function
	 * @param timeout - Max wait time in ms (default: this.timeout)
	 * @returns Promise resolving to the event
	 */
	async waitForEvent(
		eventName: string,
		predicate?: (event: BiDiEvent) => boolean,
		timeout?: number,
	): Promise<BiDiEvent> {
		const waitTimeout = timeout ?? this.timeout;

		return new Promise<BiDiEvent>((resolve, reject) => {
			const timer = setTimeout(() => {
				unsubscribe();
				reject(new BiDiError('unknown error', `Timed out waiting for event "${eventName}" after ${waitTimeout}ms`));
			}, waitTimeout);

			const unsubscribe = this.on(eventName, (event) => {
				if (!predicate || predicate(event)) {
					clearTimeout(timer);
					unsubscribe();
					resolve(event);
				}
			});
		});
	}

	/** Whether the transport is currently connected */
	get isConnected(): boolean {
		return this.connected;
	}

	/**
	 * Close the connection gracefully.
	 */
	async close(): Promise<void> {
		// Reject all pending
		for (const [, cmd] of this.pending) {
			clearTimeout(cmd.timer);
			cmd.reject(new BiDiError('unknown error', 'Transport closed'));
		}
		this.pending.clear();
		this.connected = false;

		if (this.virtualSend) {
			// Virtual mode: call the cleanup function
			this.virtualCloseFn?.();
			this.virtualSend = null;
			this.virtualCloseFn = null;
			return;
		}

		if (!this.ws) return;

		return new Promise<void>((resolve) => {
			if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
				resolve();
				return;
			}

			this.ws.on('close', () => {
				resolve();
			});

			this.ws.close();
		});
	}

	// -----------------------------------------------------------------------
	// Private
	// -----------------------------------------------------------------------

	private handleMessage(raw: string): void {
		let msg: BiDiMessage;
		try {
			msg = JSON.parse(raw) as BiDiMessage;
		} catch {
			// Malformed JSON from browser -- ignore
			return;
		}

		// Event (no id, type === 'event')
		if (msg.type === 'event') {
			const event = msg as BiDiEvent;
			// Notify specific handlers
			this.eventHandlers.get(event.method)?.forEach((h) => h(event));
			// Notify global handlers
			this.globalEventHandlers.forEach((h) => h(event));
			return;
		}

		// Response (has id)
		if ('id' in msg && msg.id !== undefined) {
			const pending = this.pending.get(msg.id);
			if (!pending) return; // Orphaned response -- ignore

			this.pending.delete(msg.id);
			clearTimeout(pending.timer);

			if (msg.type === 'success') {
				pending.resolve(msg.result);
			} else if (msg.type === 'error') {
				pending.reject(
					new BiDiError(msg.error, msg.message, msg.stacktrace),
				);
			} else {
				// Unknown response type -- shouldn't happen but handle gracefully
				pending.reject(
					new BiDiError('unknown error', `Unexpected response type: ${JSON.stringify(msg).slice(0, 200)}`),
				);
			}
		}
	}
}
