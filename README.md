# Browsecraft

[![CI](https://github.com/rik9564/browsecraft/actions/workflows/ci.yml/badge.svg)](https://github.com/rik9564/browsecraft/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/browsecraft)](https://www.npmjs.com/package/browsecraft)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

AI-native browser automation framework. Write tests that read like plain English.

```ts
import { test, expect } from 'browsecraft';

test('user can log in', async ({ page }) => {
  await page.go('https://www.saucedemo.com');
  await page.fill('Username', 'standard_user');
  await page.fill('Password', 'secret_sauce');
  await page.click('Login');

  await page.see('Products');
  await expect(page).toHaveURL(/inventory/);
});
```

No CSS selectors. No XPath. Every line reads as `subject.verb(target)` — like giving instructions to a person.

## Getting Started

```bash
npm init browsecraft
```

That's it. One command scaffolds everything you need:

- `browsecraft.config.ts` — configuration
- `tsconfig.json` — TypeScript setup
- `tests/example.test.ts` — example test you can run immediately
- Installs all dependencies

**With BDD support** (Gherkin feature files + step definitions):

```bash
npm init browsecraft -- --bdd
```

This additionally creates:

- `features/example.feature` — example Gherkin feature file
- `steps/steps.ts` — step definitions with 38 built-in steps pre-registered

**Other options:**

```bash
npm init browsecraft my-tests          # Scaffold into a directory
npm init browsecraft -- --js           # JavaScript instead of TypeScript
npm init browsecraft -- --quiet --bdd  # Non-interactive (CI mode)
```

Works with any package manager:

```bash
pnpm create browsecraft
yarn create browsecraft
```

Requires Node.js 20+ and Chrome, Edge, or Firefox installed on your machine.

## Run Your Tests

```bash
npx browsecraft test                   # Run all tests
npx browsecraft test --headed          # Watch the browser
npx browsecraft test --browser firefox # Use Firefox
npx browsecraft test --grep "login"    # Filter by name
npx browsecraft test --bdd             # Run BDD feature files
npx browsecraft test --bdd --scenario "login"        # Run specific BDD scenario
npx browsecraft test --bdd features/login.feature:15 # Run scenario at line 15
npx browsecraft test --bdd --tag "@smoke"             # Filter by tag
npx browsecraft test --bdd --ai-steps auto            # AI fallback for undefined steps
npx browsecraft test --bdd --ai-steps locked          # Cache-only AI (CI-friendly)
npx browsecraft setup-ide              # Generate IDE config for step discovery
```

## Multi-Browser Parallel Execution

**No other BDD framework offers scenario-level distribution across multi-browser worker pools.** Browsecraft ships a first-class execution engine that runs individual scenarios — not files — across Chrome, Firefox, and Edge simultaneously.

### Three execution strategies

| Strategy | How it works | Best for |
|----------|-------------|----------|
| `parallel` | All browser pools run at once; scenarios distributed across all workers | Speed — when tests are browser-independent |
| `sequential` | One browser at a time; each gets the full scenario set | Isolated runs or limited resources |
| `matrix` | Every scenario × every browser (full cross-browser coverage) | QA sign-off — guarantees every scenario runs on every browser |

### Configuration

```ts
// browsecraft.config.ts
import { defineConfig } from 'browsecraft';

export default defineConfig({
  browsers: ['chrome', 'firefox', 'edge'],
  strategy: 'matrix',   // 'parallel' | 'sequential' | 'matrix'
  workers: 4,            // total worker instances
});
```

### Programmatic API

```ts
import { EventBus, WorkerPool, Scheduler, ResultAggregator } from 'browsecraft-runner';

const bus = new EventBus();
const pool = new WorkerPool(bus, {
  browsers: { chrome: 2, firefox: 1, edge: 1 },
  maxRetries: 1,
  bail: false,
});

// Spawn browser instances
await pool.spawn(async (worker) => {
  const session = await launchBrowser(worker.browser);
  return { close: () => session.close() };
});

// Schedule execution
const scheduler = new Scheduler(bus, pool, { strategy: 'matrix' });
const result = await scheduler.run(scenarios, executor);

// Aggregate & display results
const aggregator = new ResultAggregator();
const summary = aggregator.aggregate(result);

console.log(aggregator.formatMatrix(summary));
console.log(aggregator.formatSummary(summary));

await pool.terminate();
```

### Result matrix

The result aggregator produces a scenario × browser matrix with rich analytics:

```
  Scenario                                 chrome     firefox    edge
  ──────────────────────────────────────── ────────── ────────── ──────────
  User can log in                          ✓ 120ms    ✓ 145ms    ✓ 130ms
  Add item to cart                         ✓ 80ms     ✗ 92ms     ✓ 85ms    ⚠️
  Checkout with saved address              ✓ 200ms    ✓ 210ms    ✓ 195ms   🔄

  Legend: ✓ passed  ✗ failed  - skipped  🔄 flaky  ⚠️  inconsistent
```

### Built-in analytics

- **Flaky test detection** — tests that passed only after retries get flagged
- **Cross-browser inconsistency** — scenarios that pass on one browser but fail on another
- **Timing statistics** — min, max, avg, median, and p95 per scenario
- **Work-stealing scheduling** — workers pull items from a shared queue for optimal load balancing

### Event-driven architecture

The `EventBus` decouples execution from reporting. Subscribe to any lifecycle event:

```ts
bus.on('item:pass', ({ item, worker, duration }) => {
  console.log(`✓ ${item.title} on ${worker.browser} (${duration}ms)`);
});

bus.on('item:fail', ({ item, error }) => {
  console.log(`✗ ${item.title}: ${error.message}`);
});

bus.on('progress', ({ completed, total }) => {
  console.log(`${completed}/${total}`);
});
```

Events include `run:start/end`, `worker:spawn/ready/busy/idle/error/terminate`, `item:enqueue/start/pass/fail/skip/retry/end`, `browser:start/end`, and `progress`. This makes it trivial to build custom reporters, CI integrations, or a future UI test runner.

## API

### Launch a browser

```js
import { Browser } from 'browsecraft';

const browser = await Browser.launch({
  browser: 'chrome',   // 'chrome' | 'firefox' | 'edge' (default: 'chrome')
  headless: true,       // default: true
  maximized: false,     // maximize the window (headed mode only)
});

const page = await browser.newPage();
// ... do things ...
await browser.close();
```

### Navigate

```js
await page.go('https://example.com');        // English alias (preferred)
await page.goto('https://example.com');      // Also works

const url = await page.url();
const title = await page.title();
const html = await page.content();
```

### Click

```js
// By visible text — Browsecraft finds the element for you
await page.click('Submit');
await page.click('Add to cart');

// By CSS selector — when you need precision
await page.click({ selector: '[data-test="login-button"]' });
```

### Fill in fields

```js
// By label or placeholder text
await page.fill('Username', 'standard_user');
await page.fill('Password', 'secret_sauce');

// By CSS selector
await page.fill({ selector: '#email' }, 'user@example.com');
```

### Assert visibility

```js
// Verify an element is visible on the page (auto-waits)
await page.see('Products');
await page.see('Welcome back!');
await page.see({ role: 'heading', name: 'Dashboard' });
```

### Wait for things

```js
await page.waitForURL('dashboard');              // URL contains "dashboard"
await page.waitForURL(/checkout/);               // URL matches regex
await page.waitForSelector({ selector: '.loaded' }); // element appears
```

### Find elements

```js
const el = await page.get({ selector: '.product-card' });
const btn = await page.getByText('Add to Cart');

await el.textContent();
await el.isVisible();
await el.getAttribute('href');
```

### Read text from the page

```js
const text = await page.innerText({ selector: '.message' });
```

### Run JavaScript in the browser

```js
const count = await page.evaluate('document.querySelectorAll(".item").length');
const data = await page.evaluate('({ name: "test", items: [1, 2, 3] })');
```

### Screenshots

```js
const buffer = await page.screenshot(); // returns PNG Buffer

import { writeFileSync } from 'node:fs';
writeFileSync('screenshot.png', buffer);
```

### Cookies

```js
await page.getCookies();
await page.clearCookies();
```

### Multiple tabs

```js
const page1 = await browser.newPage();
const page2 = await browser.newPage();

browser.openPages;   // [page1, page2]
browser.isConnected; // true

await page1.close();
await page2.close();
await browser.close();
```

### Network interception

Intercept requests, mock API responses, wait for network activity, or block unwanted requests.

```js
// Intercept and mock an API response
await page.intercept('POST /api/login', async (request) => {
  return { status: 200, body: { token: 'abc' } };
});

// Mock a response (simpler shorthand)
await page.mock('GET /api/users', {
  status: 200,
  body: [{ name: 'Alice' }],
});

// Wait for a response
const response = await page.waitForResponse('/api/users');
console.log(response.status); // 200

// Block requests (ads, analytics, etc.)
await page.blockRequests(['*.google-analytics.com*', '*.doubleclick.net*']);
```

## Actionability

Browsecraft auto-waits for elements to be actionable before performing actions. Every `click()`, `fill()`, and `see()` call automatically checks that the target element is:

- **Visible** — not `display:none`, `visibility:hidden`, or `opacity:0`
- **Enabled** — not disabled
- **Stable** — has non-zero size and is attached to the DOM
- **Unobscured** — not covered by another element (modals, overlays)

If an element isn't ready, Browsecraft retries until the configured timeout (default: 30s). When it fails, you get a rich error message explaining exactly what went wrong:

```
ElementNotActionableError: Could not click 'Submit'
— the element was found but is disabled.

Element state:
  Tag: <button>
  Text: "Submit"
  Visible: true
  Enabled: false

Hint: Wait for the element to become enabled, or check if a
      prerequisite action is needed first.
(waited 30000ms)
```

## Error Types

Every error tells you **what failed**, **why**, and **how to fix it**:

| Error | When |
|-------|------|
| `ElementNotFoundError` | No matching element in the DOM |
| `ElementNotActionableError` | Element found but not visible, disabled, or obscured |
| `NetworkError` | Network interception/mock failure |
| `TimeoutError` | Operation exceeded timeout |

All errors extend `BrowsecraftError` and include `action`, `target`, `elementState`, `hint`, and `elapsed` properties for programmatic handling.

## BDD Testing

Browsecraft has a built-in BDD framework. No Cucumber, no third-party dependencies — everything is custom-built.

### 38 built-in steps

Register pre-built steps to start writing `.feature` files immediately with zero step definitions:

```js
import { registerBuiltInSteps } from 'browsecraft-bdd';

registerBuiltInSteps(); // Registers all 38 steps into the global registry
```

Built-in steps cover navigation, clicking, filling forms, visibility assertions, URL checks, waiting, and more. Examples:

```gherkin
Given I go to "https://example.com"
When I click "Submit"
When I fill "Username" with "admin"
Then I should see "Welcome"
Then the URL should contain "dashboard"
```

You can mix built-in steps with your own custom step definitions.

There are two ways to write BDD tests:

### Option 1: Gherkin `.feature` files

Write scenarios in plain English, then wire them to code with step definitions.

**`features/login.feature`**

```gherkin
Feature: User Login

  Scenario: Successful login
    Given I am on the login page
    When I fill "Username" with "standard_user"
    And I fill "Password" with "secret_sauce"
    And I click "Login"
    Then I should see "Products"
```

**`test.mjs`**

```js
import { readFileSync } from 'node:fs';
import { Browser } from 'browsecraft';
import {
  parseGherkin, Given, When, Then,
  BddExecutor, globalRegistry,
} from 'browsecraft-bdd';

// --- Step definitions ---
// Each Given/When/Then matches a line in the .feature file.
// {string} captures a quoted argument.

Given('I am on the login page', async (world) => {
  await world.page.goto('https://www.saucedemo.com');
});

When('I fill {string} with {string}', async (world, field, value) => {
  await world.page.fill(field, value);
});

When('I click {string}', async (world, text) => {
  await world.page.click(text);
});

Then('I should see {string}', async (world, text) => {
  const content = await world.page.content();
  if (!content.includes(text)) throw new Error(`Expected "${text}" on page`);
});

// --- Run ---

const browser = await Browser.launch();
const doc = parseGherkin(readFileSync('features/login.feature', 'utf-8'));

const executor = new BddExecutor({
  registry: globalRegistry,
  worldFactory: async () => ({
    page: await browser.newPage(),
    browser,
    ctx: {},
    attach: () => {},
    log: console.log,
  }),
});

const result = await executor.runDocument(doc);
console.log(`${result.summary.scenarios.passed}/${result.summary.scenarios.total} passed`);
await browser.close();
```

### Option 2: TypeScript-native BDD

Same structured BDD output, but no `.feature` files — write everything in code.

```js
import { Browser } from 'browsecraft';
import { feature, scenario, given, when, then, runFeatures } from 'browsecraft-bdd';

feature('User Login', () => {
  scenario('Successful login', ({ page }) => {
    given('I am on the login page', () =>
      page.goto('https://www.saucedemo.com'));

    when('I enter credentials and log in', async () => {
      await page.fill('Username', 'standard_user');
      await page.fill('Password', 'secret_sauce');
      await page.click('Login');
    });

    then('I should see the products page', () =>
      page.waitForURL('inventory'));
  });
});

const browser = await Browser.launch();
const result = await runFeatures({
  worldFactory: async () => ({
    page: await browser.newPage(),
    browser,
    ctx: {},
    attach: () => {},
    log: console.log,
  }),
});
console.log(`${result.summary.scenarios.passed}/${result.summary.scenarios.total} passed`);
await browser.close();
```

### Tags

Filter which scenarios run using tag expressions:

```gherkin
@smoke
Scenario: Quick test
  ...

@slow @integration
Scenario: Full flow
  ...
```

```js
const executor = new BddExecutor({
  tagFilter: '@smoke and not @slow',
  // ...
});
```

Supports `and`, `or`, `not`, and parentheses.

### Scenario Filtering

Run specific scenarios by name, tag, or line number:

```bash
# By scenario name (substring match)
npx browsecraft test --bdd --scenario "login"

# By tag expression
npx browsecraft test --bdd --tag "@smoke and not @wip"

# By line number in a feature file
npx browsecraft test --bdd features/login.feature:15

# Combine filters (AND logic)
npx browsecraft test --bdd --scenario "login" --tag "@smoke"
```

Programmatically, use `grep` and `scenarioFilter` on `BddExecutor`:

```ts
const executor = new BddExecutor({
  grep: 'login',            // skip scenarios that don't match
  scenarioFilter: (name, tags, uri) => {
    return tags.includes('@smoke'); // custom filter logic
  },
  // ...
});
```

### Runtime AI Steps (Optional)

Enable AI interpretation for undefined BDD steps with a single mode:

```ts
import { defineConfig } from 'browsecraft';

export default defineConfig({
  ai: 'auto', // or { provider: 'openai' } / { provider: 'anthropic' } / { provider: 'ollama' }
  bdd: {
    aiSteps: 'auto', // 'off' | 'auto' | 'locked' | 'warm'
  },
});
```

- `'off'`: no runtime AI (default)
- `'auto'`: use cache, call AI on misses
- `'locked'`: cache only, no live AI calls
- `'warm'`: always call AI and refresh cache

### Hooks

```js
import { Before, After, BeforeAll, AfterAll } from 'browsecraft-bdd';

BeforeAll(async () => { /* one-time setup */ });
AfterAll(async () => { /* one-time teardown */ });
Before(async (ctx) => { /* before each scenario */ });
After(async (ctx) => { /* after each scenario */ });
```

### Gherkin parser features

The built-in parser handles the full Gherkin spec:

- Scenario Outlines with Examples tables
- Background steps
- Data Tables and Doc Strings
- Tags on features and scenarios
- Rules
- Comments
- [Multiple languages](https://cucumber.io/docs/gherkin/languages/) (English, Spanish, French, German, Japanese, and more)

## AI Features (Optional)

AI features use the [GitHub Models API](https://github.com/marketplace/models) — free with any GitHub account. Set a PAT with the `models` scope:

```bash
export GITHUB_TOKEN=ghp_...
```

Everything works without AI. These features enhance the experience when available.

| Feature | What it does |
| --- | --- |
| Self-healing selectors | When a CSS selector breaks, suggests a replacement using page context |
| AI failure diagnosis | Analyzes failures with page context and suggests fixes |
| Test generation | Generates test code from a natural-language description |
| Visual regression | Compares screenshots pixel-by-pixel, with optional AI semantic analysis |
| Auto-step generation | Writes BDD step definitions from `.feature` files automatically |
| Persistent AI cache | Caches AI results on disk to avoid redundant API calls |
| Confidence gating | Only applies AI suggestions above a configurable confidence threshold |

```js
import { healSelector, generateTest, compareScreenshots, diagnoseFailure } from 'browsecraft-ai';
```

### Self-Healing Selectors

When a CSS selector breaks, Browsecraft automatically attempts to find a replacement:

```ts
// Happens automatically during page.click(), page.fill(), etc.
// Configure in browsecraft.config.ts:
export default defineConfig({
  selfHealing: true,         // enable/disable (default: true)
  selfHealingConfidence: 0.7, // minimum confidence to auto-apply (0.0-1.0)
});
```

### AI Failure Diagnosis

When a test fails, Browsecraft can use AI to analyze the failure and suggest fixes:

```ts
import { diagnoseFailure } from 'browsecraft-ai';

const diagnosis = await diagnoseFailure(error, {
  url: 'https://example.com',
  title: 'My Page',
  pageSnapshot: '<html>...</html>',
});

console.log(diagnosis?.suggestion);  // "The selector '.old-class' no longer exists. Try '.new-class'."
console.log(diagnosis?.confidence);  // 0.85
```

## Adaptive Timing

Browsecraft automatically adjusts timeouts based on observed performance. Fast operations get shorter timeouts, slow operations get more time — no manual tuning needed.

```ts
export default defineConfig({
  adaptiveTiming: true,  // default: true
  timeout: 30000,        // base timeout (adapted per-action)
});
```

The system tracks how long each action type (click, fill, navigation) typically takes and adjusts expectations accordingly.

## Failure Classification & Smart Retry

Not all failures are equal. Browsecraft classifies each failure and only retries the ones that might succeed on a second attempt:

| Category | Retryable | Examples |
|----------|-----------|----------|
| Network | Yes | `ECONNRESET`, `ECONNREFUSED`, socket timeouts |
| Timeout | Yes | Navigation timeouts, page load timeouts |
| Element | Conditional | Element not found (retryable), element disabled (not retryable) |
| Assertion | No | `Expected "foo" but got "bar"` |
| Script | No | `TypeError`, `ReferenceError` in evaluated code |

```ts
export default defineConfig({
  retries: 2,           // max retry attempts
  retryStrategy: 'smart', // 'smart' (default) | 'all' | 'none'
});
```

## IDE Integration

Zero-config step definition discovery for VS Code with the Cucumber extension.

```bash
npx browsecraft setup-ide
```

This generates:

- `.vscode/settings.json` — Cucumber extension glue path configuration
- `.vscode/extensions.json` — Recommends the Cucumber extension
- `glue/steps.js` — 38 built-in step patterns in Cucumber-compatible format

Your `.feature` files get full autocomplete and go-to-definition for all built-in steps, plus any custom steps you define.

## Examples

The [`examples/`](examples/) directory has complete, runnable projects you can copy as a starting point:

| Example | What it shows |
| --- | --- |
| [`getting-started/`](examples/getting-started/) | Imperative tests — login, cart, checkout, screenshots |
| [`bdd-gherkin/`](examples/bdd-gherkin/) | `.feature` files with step definitions (9 scenarios) |
| [`bdd-typescript/`](examples/bdd-typescript/) | TypeScript-native BDD with `feature()`/`scenario()` (6 scenarios) |

All examples test against the [Sauce Labs Demo App](https://www.saucedemo.com) (public, no account needed):

```bash
cd examples/getting-started
npm install
node test.mjs              # headless
node test.mjs --headed     # watch it run
node test.mjs --maximized  # full screen
```

## Architecture

Six npm packages, one monorepo:

| Package | Role |
| --- | --- |
| `browsecraft` | Main package. Page API, Browser, config, CLI, adaptive timing, self-healing. |
| `browsecraft-bdd` | Gherkin parser, step registry, executor, hooks, tags, TS-native BDD, 38 built-in steps, AI auto-steps. |
| `browsecraft-bidi` | WebDriver BiDi protocol client and browser launcher. |
| `browsecraft-runner` | Event bus, multi-browser worker pool, parallel scheduler, result aggregator, failure classification, smart retry. |
| `browsecraft-ai` | Self-healing selectors, AI failure diagnosis, test generation, visual diff, persistent cache. |
| `create-browsecraft` | Project scaffolding CLI (`npm init browsecraft`). Zero dependencies. |

Most users only need `browsecraft`. Add `browsecraft-bdd` for BDD, `browsecraft-ai` for AI features.

Built on the [W3C WebDriver BiDi](https://w3c.github.io/webdriver-bidi/) protocol — controls real, unpatched browser binaries. No special builds, no browser extensions.

## License

[MIT](LICENSE)
