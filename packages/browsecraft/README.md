# Browsecraft

Browser automation that just works.

```js
import { Browser } from 'browsecraft';

const browser = await Browser.launch();
const page = await browser.newPage();

await page.goto('https://www.saucedemo.com');
await page.fill('Username', 'standard_user');
await page.fill('Password', 'secret_sauce');
await page.click('Login');

await page.waitForURL('inventory');
console.log(await page.title()); // "Swag Labs"

await browser.close();
```

No CSS selectors. No XPath. Just tell it what you see on the page.

## Install

```bash
npm install browsecraft
```

Requires Node.js 20+ and Chrome, Edge, or Firefox installed on your machine.

## Quick Start

Create a file called `test.mjs`:

```js
import { Browser } from 'browsecraft';

const browser = await Browser.launch();
const page = await browser.newPage();

await page.goto('https://example.com');
console.log(await page.title()); // "Example Domain"

const screenshot = await page.screenshot();
const { writeFileSync } = await import('node:fs');
writeFileSync('screenshot.png', screenshot);

await browser.close();
```

Run it:

```bash
node test.mjs
```

That's it. No config files, no test runner setup, no boilerplate.

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
await page.goto('https://example.com');

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

## BDD Testing

Browsecraft has a built-in BDD framework. No Cucumber, no third-party dependencies — everything is custom-built.

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
| Test generation | Generates test code from a natural-language description |
| Visual regression | Compares screenshots pixel-by-pixel, with optional AI semantic analysis |
| Auto-step generation | Writes BDD step definitions from `.feature` files automatically |

```js
import { healSelector, generateTest, compareScreenshots } from 'browsecraft-ai';
```

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

Five npm packages, one monorepo:

| Package | Role |
| --- | --- |
| `browsecraft` | Main package. Page API, Browser, config, CLI. |
| `browsecraft-bdd` | Gherkin parser, step registry, executor, hooks, tags, TS-native BDD. |
| `browsecraft-bidi` | WebDriver BiDi protocol client and browser launcher. |
| `browsecraft-runner` | Test file discovery, execution, reporter types. |
| `browsecraft-ai` | Self-healing selectors, test generation, visual diff. |

Most users only need `browsecraft`. Add `browsecraft-bdd` for BDD, `browsecraft-ai` for AI features.

Built on the [W3C WebDriver BiDi](https://w3c.github.io/webdriver-bidi/) protocol — controls real, unpatched browser binaries. No special builds, no browser extensions.

## License

[MIT](LICENSE)
