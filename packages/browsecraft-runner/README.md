# browsecraft-runner

Test runner and CLI for [Browsecraft](https://github.com/rik9564/browsecraft).

Discovers test files, coordinates execution, and reports results. Used internally by the `browsecraft` CLI.

Most users should install [`browsecraft`](https://www.npmjs.com/package/browsecraft) instead — it includes the runner automatically.

## Install

```bash
npm install browsecraft-runner
```

## Usage

```js
import { TestRunner } from 'browsecraft-runner';

const runner = new TestRunner({
  config: {
    browser: 'chrome',
    headless: true,
    timeout: 30000,
    retries: 0,
    testMatch: ['**/*.test.mjs'],
    outputDir: 'test-results',
  },
  grep: 'login',   // optional: filter tests by name
  bail: false,      // optional: stop on first failure
});

const exitCode = await runner.run(loadFile, executeTest);
```

## Features

- Test file discovery by glob patterns
- Grep filtering by test name
- `.only` support for focused tests
- Retry on failure
- Bail on first failure
- Color-coded console reporter

## Configuration

The runner accepts a `BrowsecraftConfig` object:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `browser` | `string` | `'chrome'` | Browser to use (`chrome`, `firefox`, `edge`) |
| `headless` | `boolean` | `true` | Run in headless mode |
| `timeout` | `number` | `30000` | Test timeout in ms |
| `retries` | `number` | `0` | Retry failed tests |
| `testMatch` | `string[]` | `['**/*.test.*']` | Glob patterns for test files |
| `outputDir` | `string` | `'test-results'` | Output directory for artifacts |
| `viewport` | `object` | `{ width: 1280, height: 720 }` | Browser viewport size |
| `maximized` | `boolean` | `false` | Maximize the browser window |
| `baseURL` | `string` | — | Base URL for `page.goto()` |
| `workers` | `number` | `1` | Number of parallel workers |

## License

[MIT](LICENSE)
