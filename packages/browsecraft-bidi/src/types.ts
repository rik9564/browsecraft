// ============================================================================
// Browsecraft BiDi - WebDriver BiDi Protocol Types
// Full type definitions for the W3C WebDriver BiDi specification
// https://w3c.github.io/webdriver-bidi/
// ============================================================================

// ---------------------------------------------------------------------------
// Core message types - every BiDi message follows one of these shapes
// ---------------------------------------------------------------------------

/** Command sent from client to browser */
export interface BiDiCommand {
	id: number;
	method: string;
	params: Record<string, unknown>;
}

/** Successful response from browser */
export interface BiDiSuccessResponse {
	type: 'success';
	id: number;
	result: Record<string, unknown>;
}

/** Error response from browser */
export interface BiDiErrorResponse {
	type: 'error';
	id: number;
	error: string;
	message: string;
	stacktrace?: string;
}

/** Event pushed from browser (no id, no request needed) */
export interface BiDiEvent {
	type: 'event';
	method: string;
	params: Record<string, unknown>;
}

/** Any message that can arrive from the browser */
export type BiDiMessage = BiDiSuccessResponse | BiDiErrorResponse | BiDiEvent;

// ---------------------------------------------------------------------------
// Session module
// ---------------------------------------------------------------------------

export interface SessionNewParams {
	capabilities?: {
		alwaysMatch?: Record<string, unknown>;
		firstMatch?: Record<string, unknown>[];
	};
}

export interface SessionNewResult {
	sessionId: string;
	capabilities: Record<string, unknown>;
}

export interface SessionSubscribeParams {
	events: string[];
	contexts?: string[];
}

// ---------------------------------------------------------------------------
// Browsing Context module
// ---------------------------------------------------------------------------

export type BrowsingContextCreateType = 'tab' | 'window';

export interface BrowsingContextCreateParams {
	type: BrowsingContextCreateType;
	referenceContext?: string;
	background?: boolean;
	userContext?: string;
}

export interface BrowsingContextCreateResult {
	context: string;
}

export type BrowsingContextReadinessState = 'none' | 'interactive' | 'complete';

export interface BrowsingContextNavigateParams {
	context: string;
	url: string;
	wait?: BrowsingContextReadinessState;
}

export interface BrowsingContextNavigateResult {
	navigation: string | null;
	url: string;
}

export interface BrowsingContextGetTreeParams {
	maxDepth?: number;
	root?: string;
}

export interface BrowsingContextInfo {
	context: string;
	url: string;
	userContext: string;
	children: BrowsingContextInfo[];
	parent?: string | null;
	originalOpener?: string | null;
}

export interface BrowsingContextGetTreeResult {
	contexts: BrowsingContextInfo[];
}

export interface BrowsingContextCloseParams {
	context: string;
	promptUnload?: boolean;
}

export interface BrowsingContextActivateParams {
	context: string;
}

export interface BrowsingContextReloadParams {
	context: string;
	ignoreCache?: boolean;
	wait?: BrowsingContextReadinessState;
}

export interface BrowsingContextCaptureScreenshotParams {
	context: string;
	origin?: 'viewport' | 'document';
	format?: {
		type: 'image/png' | 'image/jpeg' | 'image/webp';
		quality?: number;
	};
	clip?: BoxClipRectangle | ElementClipRectangle;
}

export interface BoxClipRectangle {
	type: 'box';
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface ElementClipRectangle {
	type: 'element';
	element: SharedReference;
}

export interface BrowsingContextCaptureScreenshotResult {
	data: string; // base64
}

export interface BrowsingContextSetViewportParams {
	context: string;
	viewport?: { width: number; height: number } | null;
	devicePixelRatio?: number | null;
}

export interface BrowsingContextLocateNodesParams {
	context: string;
	locator: Locator;
	maxNodeCount?: number;
	startNodes?: SharedReference[];
}

export interface BrowsingContextLocateNodesResult {
	nodes: NodeRemoteValue[];
}

export interface BrowsingContextHandleUserPromptParams {
	context: string;
	accept?: boolean;
	userText?: string;
}

export interface BrowsingContextTraverseHistoryParams {
	context: string;
	/** Positive goes forward, negative goes back */
	delta: number;
}

export interface BrowsingContextTraverseHistoryResult {
	// Empty result on success
}

// ---------------------------------------------------------------------------
// Locator types - how BiDi finds elements
// ---------------------------------------------------------------------------

export type Locator =
	| CssLocator
	| XPathLocator
	| InnerTextLocator
	| AccessibilityLocator;

export interface CssLocator {
	type: 'css';
	value: string;
}

export interface XPathLocator {
	type: 'xpath';
	value: string;
}

export interface InnerTextLocator {
	type: 'innerText';
	value: string;
	ignoreCase?: boolean;
	matchType?: 'full' | 'partial';
	maxDepth?: number;
}

export interface AccessibilityLocator {
	type: 'accessibility';
	value: {
		name?: string;
		role?: string;
	};
}

// ---------------------------------------------------------------------------
// Script module
// ---------------------------------------------------------------------------

export interface ScriptEvaluateParams {
	expression: string;
	target: ScriptTarget;
	awaitPromise: boolean;
	resultOwnership?: 'root' | 'none';
	serializationOptions?: SerializationOptions;
	userActivation?: boolean;
}

export interface ScriptCallFunctionParams {
	functionDeclaration: string;
	target: ScriptTarget;
	awaitPromise: boolean;
	this?: RemoteValue;
	arguments?: (RemoteValue | SharedReference)[];
	resultOwnership?: 'root' | 'none';
	serializationOptions?: SerializationOptions;
	userActivation?: boolean;
}

export interface ScriptTarget {
	context?: string;
	realm?: string;
	sandbox?: string;
}

export interface SerializationOptions {
	maxDomDepth?: number;
	maxObjectDepth?: number;
	includeShadowTree?: 'none' | 'open' | 'all';
}

export interface ScriptEvaluateResult {
	type: 'success' | 'exception';
	realm: string;
	result?: RemoteValue;
	exceptionDetails?: ExceptionDetails;
}

export interface ExceptionDetails {
	columnNumber: number;
	exception: RemoteValue;
	lineNumber: number;
	stackTrace: StackTrace;
	text: string;
}

export interface StackTrace {
	callFrames: StackFrame[];
}

export interface StackFrame {
	columnNumber: number;
	functionName: string;
	lineNumber: number;
	url: string;
}

export interface ScriptAddPreloadScriptParams {
	functionDeclaration: string;
	arguments?: RemoteValue[];
	contexts?: string[];
	sandbox?: string;
}

export interface ScriptAddPreloadScriptResult {
	script: string;
}

export interface ScriptRemovePreloadScriptParams {
	script: string;
}

// ---------------------------------------------------------------------------
// Remote values - how BiDi serializes JS values
// ---------------------------------------------------------------------------

export interface SharedReference {
	sharedId: string;
	handle?: string;
}

export type RemoteValue =
	| PrimitiveRemoteValue
	| NodeRemoteValue
	| ObjectRemoteValue;

export type PrimitiveRemoteValue =
	| { type: 'undefined' }
	| { type: 'null' }
	| { type: 'string'; value: string }
	| { type: 'number'; value: number | 'NaN' | '-0' | 'Infinity' | '-Infinity' }
	| { type: 'boolean'; value: boolean }
	| { type: 'bigint'; value: string };

export interface NodeRemoteValue {
	type: 'node';
	sharedId?: string;
	handle?: string;
	value?: NodeProperties;
}

export interface NodeProperties {
	nodeType: number;
	childNodeCount: number;
	attributes?: Record<string, string>;
	children?: NodeRemoteValue[];
	localName?: string;
	namespaceURI?: string;
	nodeValue?: string;
	shadowRoot?: NodeRemoteValue | null;
}

export interface ObjectRemoteValue {
	type: 'object' | 'array' | 'map' | 'set' | 'regexp' | 'date' | 'function';
	handle?: string;
	value?: unknown;
}

// ---------------------------------------------------------------------------
// Network module
// ---------------------------------------------------------------------------

export interface NetworkAddInterceptParams {
	phases: NetworkInterceptPhase[];
	urlPatterns?: UrlPattern[];
	contexts?: string[];
}

export type NetworkInterceptPhase =
	| 'beforeRequestSent'
	| 'responseStarted'
	| 'authRequired';

export type UrlPattern = UrlPatternString | UrlPatternPattern;

export interface UrlPatternString {
	type: 'string';
	pattern: string;
}

export interface UrlPatternPattern {
	type: 'pattern';
	protocol?: string;
	hostname?: string;
	port?: string;
	pathname?: string;
	search?: string;
}

export interface NetworkAddInterceptResult {
	intercept: string;
}

export interface NetworkContinueRequestParams {
	request: string;
	url?: string;
	method?: string;
	headers?: NetworkHeader[];
	body?: NetworkBody;
	cookies?: NetworkCookieHeader[];
}

export interface NetworkProvideResponseParams {
	request: string;
	statusCode: number;
	reasonPhrase?: string;
	headers?: NetworkHeader[];
	body?: NetworkBody;
	cookies?: NetworkSetCookieHeader[];
}

export interface NetworkFailRequestParams {
	request: string;
}

export interface NetworkContinueResponseParams {
	request: string;
	statusCode?: number;
	reasonPhrase?: string;
	headers?: NetworkHeader[];
	cookies?: NetworkSetCookieHeader[];
}

export interface NetworkContinueWithAuthParams {
	request: string;
	action: 'provideCredentials' | 'default' | 'cancel';
	credentials?: { type: 'password'; username: string; password: string };
}

export interface NetworkHeader {
	name: string;
	value: NetworkStringValue | NetworkBytesValue;
}

export interface NetworkStringValue {
	type: 'string';
	value: string;
}

export interface NetworkBytesValue {
	type: 'base64';
	value: string;
}

export type NetworkBody = NetworkStringValue | NetworkBytesValue;

export interface NetworkCookieHeader {
	name: string;
	value: NetworkStringValue | NetworkBytesValue;
}

export interface NetworkSetCookieHeader {
	name: string;
	value: NetworkStringValue | NetworkBytesValue;
	domain?: string;
	httpOnly?: boolean;
	path?: string;
	sameSite?: 'strict' | 'lax' | 'none';
	secure?: boolean;
	expiry?: number;
}

// ---------------------------------------------------------------------------
// Network event payloads
// ---------------------------------------------------------------------------

export interface NetworkRequestData {
	request: string;
	url: string;
	method: string;
	headers: NetworkHeader[];
	cookies: NetworkCookieHeader[];
	headersSize: number;
	bodySize: number | null;
	timings: NetworkTimings;
}

export interface NetworkTimings {
	timeOrigin: number;
	requestTime: number;
	redirectStart: number;
	redirectEnd: number;
	fetchStart: number;
	dnsStart: number;
	dnsEnd: number;
	connectStart: number;
	connectEnd: number;
	tlsStart: number;
	requestStart: number;
	responseStart: number;
	responseEnd: number;
}

export interface NetworkResponseData {
	url: string;
	protocol: string;
	status: number;
	statusText: string;
	fromCache: boolean;
	headers: NetworkHeader[];
	mimeType: string;
	bytesReceived: number;
	headersSize: number;
	bodySize: number | null;
	content: {
		size: number;
	};
}

export interface NetworkBeforeRequestSentEvent {
	context: string;
	navigation: string | null;
	redirectCount: number;
	request: NetworkRequestData;
	timestamp: number;
	initiator: {
		type: 'parser' | 'script' | 'preflight' | 'other';
		columnNumber?: number;
		lineNumber?: number;
		stackTrace?: StackTrace;
		request?: string;
	};
	isBlocked: boolean;
	intercepts?: string[];
}

export interface NetworkResponseCompletedEvent {
	context: string;
	navigation: string | null;
	redirectCount: number;
	request: NetworkRequestData;
	response: NetworkResponseData;
	timestamp: number;
	isBlocked: boolean;
	intercepts?: string[];
}

export interface NetworkAuthRequiredEvent {
	context: string;
	navigation: string | null;
	redirectCount: number;
	request: NetworkRequestData;
	response: NetworkResponseData;
	timestamp: number;
	isBlocked: boolean;
	intercepts?: string[];
}

// ---------------------------------------------------------------------------
// Input module
// ---------------------------------------------------------------------------

export interface InputPerformActionsParams {
	context: string;
	actions: InputSourceActions[];
}

export type InputSourceActions =
	| KeyInputSourceActions
	| PointerInputSourceActions
	| WheelInputSourceActions
	| NoneInputSourceActions;

export interface KeyInputSourceActions {
	type: 'key';
	id: string;
	actions: KeyAction[];
}

export interface PointerInputSourceActions {
	type: 'pointer';
	id: string;
	parameters?: { pointerType?: 'mouse' | 'pen' | 'touch' };
	actions: PointerAction[];
}

export interface WheelInputSourceActions {
	type: 'wheel';
	id: string;
	actions: WheelAction[];
}

export interface NoneInputSourceActions {
	type: 'none';
	id: string;
	actions: PauseAction[];
}

export interface PauseAction {
	type: 'pause';
	duration?: number;
}

export type KeyAction =
	| PauseAction
	| { type: 'keyDown'; value: string }
	| { type: 'keyUp'; value: string };

export type PointerAction =
	| PauseAction
	| { type: 'pointerDown'; button: number; width?: number; height?: number; pressure?: number }
	| { type: 'pointerUp'; button: number }
	| {
			type: 'pointerMove';
			x: number;
			y: number;
			duration?: number;
			origin?: 'viewport' | 'pointer' | SharedReference;
			width?: number;
			height?: number;
	  };

export type WheelAction =
	| PauseAction
	| {
			type: 'scroll';
			x: number;
			y: number;
			deltaX: number;
			deltaY: number;
			duration?: number;
			origin?: 'viewport' | 'pointer';
	  };

export interface InputReleaseActionsParams {
	context: string;
}

export interface InputSetFilesParams {
	context: string;
	element: SharedReference;
	files: string[];
}

// ---------------------------------------------------------------------------
// Storage module
// ---------------------------------------------------------------------------

export interface StorageGetCookiesParams {
	filter?: CookieFilter;
	partition?: StoragePartition;
}

export interface CookieFilter {
	name?: string;
	value?: NetworkStringValue | NetworkBytesValue;
	domain?: string;
	path?: string;
	size?: number;
	httpOnly?: boolean;
	secure?: boolean;
	sameSite?: 'strict' | 'lax' | 'none';
	expiry?: number;
}

export interface StoragePartition {
	type: 'context';
	context: string;
}

export interface StorageSetCookieParams {
	cookie: NetworkSetCookieHeader;
	partition?: StoragePartition;
}

export interface StorageDeleteCookiesParams {
	filter?: CookieFilter;
	partition?: StoragePartition;
}

export interface StorageCookie {
	name: string;
	value: NetworkStringValue | NetworkBytesValue;
	domain: string;
	path: string;
	size: number;
	httpOnly: boolean;
	secure: boolean;
	sameSite: 'strict' | 'lax' | 'none';
	expiry?: number;
}

export interface StorageGetCookiesResult {
	cookies: StorageCookie[];
	partitionKey: Record<string, unknown>;
}

export interface StorageSetCookieResult {
	partitionKey: Record<string, unknown>;
}

export interface StorageDeleteCookiesResult {
	partitionKey: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Log module (events only)
// ---------------------------------------------------------------------------

export interface LogEntryAddedEvent {
	level: 'debug' | 'info' | 'warn' | 'error';
	source: {
		realm: string;
		context?: string;
	};
	text: string | null;
	timestamp: number;
	stackTrace?: StackTrace;
	type: 'console' | 'javascript';
	method?: string;
	args?: RemoteValue[];
}

// ---------------------------------------------------------------------------
// Browsing context events
// ---------------------------------------------------------------------------

export interface BrowsingContextNavigationEvent {
	context: string;
	navigation: string;
	timestamp: number;
	url: string;
}

export interface BrowsingContextUserPromptOpenedEvent {
	context: string;
	handler: 'accept' | 'dismiss' | 'ignore';
	message: string;
	type: 'alert' | 'confirm' | 'prompt' | 'beforeunload';
	defaultValue?: string;
}

// ---------------------------------------------------------------------------
// Error codes (from the spec)
// ---------------------------------------------------------------------------

export type BiDiErrorCode =
	| 'invalid argument'
	| 'invalid selector'
	| 'invalid session id'
	| 'move target out of bounds'
	| 'no such alert'
	| 'no such element'
	| 'no such frame'
	| 'no such handle'
	| 'no such intercept'
	| 'no such node'
	| 'no such request'
	| 'no such script'
	| 'no such user context'
	| 'session not created'
	| 'unable to capture screen'
	| 'unable to close browser'
	| 'unable to set cookie'
	| 'unable to set file input'
	| 'underspecified storage partition'
	| 'unknown command'
	| 'unknown error'
	| 'unsupported operation';

// ---------------------------------------------------------------------------
// BiDi error class
// ---------------------------------------------------------------------------

export class BiDiError extends Error {
	constructor(
		public readonly code: string,
		message: string,
		public readonly stacktrace?: string,
	) {
		super(`[${code}] ${message}`);
		this.name = 'BiDiError';
	}
}
