# browsecraft-bidi

WebDriver BiDi protocol client for [Browsecraft](https://github.com/rik9564/browsecraft).

This package provides low-level browser control using the [W3C WebDriver BiDi](https://w3c.github.io/webdriver-bidi/) protocol. It launches and communicates with real, unpatched browser binaries — no special builds or extensions required.

Most users should install [`browsecraft`](https://www.npmjs.com/package/browsecraft) instead, which provides a higher-level API on top of this package.

## Install

```bash
npm install browsecraft-bidi
```

Requires Node.js 20+ and Chrome, Edge, or Firefox installed on your machine.

## Usage

```js
import { BiDiSession, launchBrowser } from 'browsecraft-bidi';

// High-level: launch and connect in one step
const session = await BiDiSession.launch({ browser: 'chrome', headless: true });

// Navigate
await session.browsingContext.navigate({
  context: contextId,
  url: 'https://example.com',
  wait: 'complete',
});

// Run JavaScript in the browser
const result = await session.script.evaluate({
  expression: 'document.title',
  target: { context: contextId },
  awaitPromise: true,
});

await session.close();
```

## API

### `BiDiSession`

The main entry point. Provides organized access to BiDi protocol modules:

- `session.browsingContext` — create, navigate, close tabs, capture screenshots, locate nodes
- `session.script` — evaluate JavaScript, call functions, manage preload scripts
- `session.network` — intercept requests, provide responses, manage cookies
- `session.input` — perform keyboard, mouse, and touch actions
- `session.storage` — get, set, and delete cookies

**Factory methods:**

| Method | Description |
|--------|-------------|
| `BiDiSession.launch(options?)` | Launch a browser and connect via BiDi |
| `BiDiSession.connect(wsEndpoint)` | Connect to an already-running browser |

**Instance methods:**

| Method | Description |
|--------|-------------|
| `subscribe(events)` | Subscribe to BiDi events |
| `on(event, handler)` | Listen for a specific event |
| `waitForEvent(event, options?)` | Wait for an event with optional timeout |
| `send(method, params)` | Send a raw BiDi command |
| `close()` | Close the session and browser |

### `launchBrowser(options?)`

Finds and launches a browser with BiDi support. Auto-detects installed browser paths on Windows, Mac, and Linux.

```js
import { launchBrowser } from 'browsecraft-bidi';

const result = await launchBrowser({
  browser: 'chrome',  // 'chrome' | 'firefox' | 'edge'
  headless: true,
  maximized: false,
});

console.log(result.wsEndpoint); // WebSocket URL for BiDi
await result.close();           // Kill browser and clean up
```

### `Transport`

Low-level WebSocket transport for BiDi communication. Handles command-response correlation, event dispatch, and timeouts. Used internally by `BiDiSession`.

### Types

Full W3C WebDriver BiDi type definitions are exported, including:

- `BiDiCommand`, `BiDiEvent`, `BiDiMessage`
- Browsing context, script, network, input, storage types
- `Locator` (CSS, XPath, inner text, accessibility)
- `RemoteValue`, `NodeRemoteValue`, `SharedReference`
- `BiDiError`, `BiDiErrorCode`

## License

[MIT](LICENSE)
