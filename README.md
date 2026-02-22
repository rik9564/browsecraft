# Browsecraft

Browser automation that just works. No CSS selectors required.

Browsecraft is a browser automation and testing framework built from scratch on the W3C WebDriver BiDi protocol. It controls real, unpatched browsers with an API designed for humans.

```js
import { Browser } from 'browsecraft';

const browser = await Browser.launch();
const page = await browser.newPage();

await page.goto('https://www.saucedemo.com');
await page.fill({ selector: '[data-test="username"]' }, 'standard_user');
await page.fill({ selector: '[data-test="password"]' }, 'secret_sauce');
await page.click({ selector: '[data-test="login-button"]' });

await page.waitForURL('inventory');
console.log(await page.title()); // "Swag Labs"

await browser.close();
```

## Why Browsecraft?

- **Simple API** — `page.click('Submit')` finds buttons by visible text. CSS selectors work too, but they're the escape hatch, not the default.
- **Zero config** — No config files, no setup wizards. Install and write tests.
- **Built on BiDi** — Uses the W3C WebDriver BiDi protocol for first-class browser control. Not a CDP wrapper.
- **Built-in BDD** — Full Gherkin parser and BDD executor built from scratch. No Cucumber dependency.
- **AI-native (optional)** — Self-healing selectors, test generation, and visual regression powered by [GitHub Models API](https://github.com/marketplace/models) (free). Works perfectly without it.
- **TypeScript-first** — Written in TypeScript. JavaScript works too.

## Quick Start

```bash
npm install browsecraft
```

### Imperative Style

```js
import { Browser } from 'browsecraft';

const browser = await Browser.launch({ headless: true });
const page = await browser.newPage();

await page.goto('https://example.com');
const title = await page.title();
console.log(title);

await browser.close();
```

### BDD with .feature Files

Write scenarios in plain English:

```gherkin
# features/login.feature
Feature: User Login

  Scenario: Successful login
    Given I am on the login page
    When I fill "Username" with "standard_user"
    And I fill "Password" with "secret_sauce"
    And I click "Login"
    Then I should see "Products"
```

Wire them up with step definitions:

```js
import { Browser } from 'browsecraft';
import { parseGherkin, Given, When, Then, BddExecutor, globalRegistry } from 'browsecraft-bdd';
import { readFileSync } from 'node:fs';

Given('I am on the login page', async (world) => {
  await world.page.goto('https://www.saucedemo.com');
});

When('I fill {string} with {string}', async (world, field, value) => {
  const selectors = { 'Username': '[data-test="username"]', 'Password': '[data-test="password"]' };
  await world.page.fill({ selector: selectors[field] }, value);
});

When('I click {string}', async (world, text) => {
  await world.page.click(text); // finds by visible text
});

Then('I should see {string}', async (world, text) => {
  const content = await world.page.content();
  if (!content.includes(text)) throw new Error(`Expected "${text}" on page`);
});

// Run it
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

### BDD in Pure TypeScript (No .feature files)

```js
import { Browser } from 'browsecraft';
import { feature, scenario, given, when, then, and, runFeatures } from 'browsecraft-bdd';

feature('User Login', () => {
  scenario('Successful login', ({ page }) => {
    given('I am on the login page', async () => {
      await page.goto('https://www.saucedemo.com');
    });

    when('I enter valid credentials', async () => {
      await page.fill({ selector: '[data-test="username"]' }, 'standard_user');
      await page.fill({ selector: '[data-test="password"]' }, 'secret_sauce');
    });

    and('I click the login button', async () => {
      await page.click({ selector: '[data-test="login-button"]' });
    });

    then('I should see the products page', async () => {
      await page.waitForURL('inventory');
    });
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

## Examples

The [`examples/`](examples/) directory contains complete, runnable starter projects:

| Example | Description |
| --- | --- |
| [`getting-started/`](examples/getting-started/) | Simple imperative tests — login, cart, checkout, screenshots |
| [`bdd-gherkin/`](examples/bdd-gherkin/) | Classic BDD with `.feature` files + step definitions |
| [`bdd-typescript/`](examples/bdd-typescript/) | TypeScript-native BDD — `feature()`, `scenario()`, `given()`, `when()`, `then()` |

Each example uses the [Sauce Labs Demo App](https://www.saucedemo.com) and supports `--headed` and `--maximized` flags:

```bash
cd examples/getting-started
npm install
node test.mjs              # headless
node test.mjs --headed     # watch it run
node test.mjs --maximized  # full screen
```

## API Reference

### Browser

```js
import { Browser } from 'browsecraft';

// Launch
const browser = await Browser.launch({
  browser: 'chrome',    // 'chrome' | 'firefox' | 'edge'
  headless: true,       // default: true
  maximized: false,     // maximize the window (headed only)
});

// Create pages
const page = await browser.newPage();
const page2 = await browser.newPage(); // multiple tabs

// Properties
browser.openPages;    // array of open pages
browser.isConnected;  // connection status

await browser.close();
```

### Navigation

```js
await page.goto('https://example.com');
await page.url();                         // current URL
await page.title();                       // page title
await page.content();                     // page HTML
await page.waitForURL('dashboard');       // wait for URL to contain string
await page.waitForURL(/dashboard/);       // or regex
```

### Actions

```js
// Click — string finds by visible text, object form for CSS selectors
await page.click('Submit');                          // by visible text
await page.click({ selector: '[data-test="btn"]' }); // by CSS selector

// Fill — clears existing value and types new value
await page.fill({ selector: '#email' }, 'user@example.com');

// Smart locator — finds by label, placeholder, or visible text
await page.fill('Email', 'user@example.com');
```

### Finding Elements

```js
// By CSS selector
const el = await page.get({ selector: '.product-card' });

// By visible text
const btn = await page.getByText('Add to Cart');

// Element properties
await el.textContent();
await el.isVisible();
await el.getAttribute('href');
```

### Waiting

```js
await page.waitForSelector({ selector: '.loaded' });
await page.waitForURL('checkout');
await page.waitForURL(/success/);
```

### Evaluate

Run JavaScript in the browser:

```js
// String expression
const count = await page.evaluate('document.querySelectorAll(".item").length');

// Complex return types work: strings, numbers, booleans, arrays, objects, null
const data = await page.evaluate('({ name: "test", items: [1, 2, 3] })');
```

### Screenshots

```js
const buffer = await page.screenshot(); // returns Buffer (PNG)

import { writeFileSync } from 'node:fs';
writeFileSync('screenshot.png', buffer);
```

### Cookies

```js
await page.clearCookies();   // clear all cookies for the current page
await page.getCookies();     // get all cookies
```

### Page Lifecycle

```js
await page.close();    // close the tab
await page.innerText({ selector: '.message' }); // get inner text of element
```

## BDD Framework

Browsecraft includes a full BDD framework built from scratch — no Cucumber or third-party dependency.

### Three Modes

1. **Classic Gherkin** — Write `.feature` files, register step definitions with `Given`/`When`/`Then`, run with `BddExecutor`
2. **TypeScript-native** — Use `feature()`, `scenario()`, `given()`, `when()`, `then()` directly in code. No `.feature` files needed.
3. **AI-assisted** — Write `.feature` files only. AI generates step definitions automatically (requires GitHub Models API token).

### Step Definitions (Classic Gherkin)

```js
import { Given, When, Then } from 'browsecraft-bdd';

// {string} captures quoted arguments
Given('I am on the {string} page', async (world, pageName) => {
  await world.page.goto(`https://example.com/${pageName}`);
});

// {int} captures integers, {float} captures decimals
Then('I should see {int} products', async (world, count) => {
  // count is a number
});
```

### Tag Filtering

```gherkin
@smoke
Scenario: Quick test
  ...
```

```js
const executor = new BddExecutor({
  registry: globalRegistry,
  tagFilter: '@smoke and not @slow',
  // ...
});
```

Tag expressions support `and`, `or`, `not`, and parentheses.

### Hooks

```js
import { Before, After, BeforeAll, AfterAll, BeforeFeature, AfterFeature } from 'browsecraft-bdd';

BeforeAll(async () => { /* setup */ });
AfterAll(async () => { /* teardown */ });

Before(async (context) => { /* before each scenario */ });
After(async (context) => { /* after each scenario */ });

BeforeFeature(async (context) => { /* before each feature */ });
AfterFeature(async (context) => { /* after each feature */ });
```

### Gherkin Parser

The built-in parser supports:

- Features, Scenarios, Scenario Outlines with Examples tables
- Background steps
- Data Tables and Doc Strings
- Tags (on features and scenarios)
- Rules
- Comments
- Multiple languages (English, Spanish, French, German, Japanese, and more)

```js
import { parseGherkin, getSupportedLanguages } from 'browsecraft-bdd';

const doc = parseGherkin(featureText, 'login.feature');
console.log(doc.feature.name);       // "User Login"
console.log(doc.feature.children);   // scenarios, backgrounds, rules

getSupportedLanguages(); // ['en', 'es', 'fr', 'de', 'ja', ...]
```

## AI Features (Optional)

AI features use the [GitHub Models API](https://github.com/marketplace/models) — free with a GitHub PAT that has the `models` scope. Everything works perfectly without AI.

```bash
# Set your GitHub token (needs 'models' scope)
export GITHUB_TOKEN=ghp_...
```

### Self-Healing Selectors

When a selector breaks after a UI refactor, Browsecraft can suggest a replacement:

```js
import { healSelector } from 'browsecraft-ai';

const result = await healSelector('#old-submit-btn', pageSnapshot, {
  context: 'login form submit button',
});

if (result.healed) {
  console.log(`Try: ${result.selector} (${result.confidence * 100}% confidence)`);
}
```

Falls back to text similarity and attribute matching when AI is unavailable.

### Test Generation

Generate test code from natural language:

```js
import { generateTest } from 'browsecraft-ai';

const result = await generateTest({
  description: 'Test that a user can log in and see the dashboard',
  url: 'https://myapp.com/login',
});

console.log(result.code);
```

### Visual Regression

Compare screenshots pixel-by-pixel with optional AI-powered semantic analysis:

```js
import { compareScreenshots } from 'browsecraft-ai';

const result = await compareScreenshots('baseline.png', 'current.png', {
  threshold: 5,           // per-channel tolerance (0-255)
  maxDiffPercent: 0.1,    // max allowed diff percentage
  diffOutputPath: 'diff.png',
});

if (!result.match) {
  console.log(`${result.diffPercent.toFixed(2)}% pixels differ`);
}
```

Zero dependencies — parses PNG buffers directly.

## Architecture

Browsecraft is a monorepo with five packages:

| Package | Description |
| --- | --- |
| `browsecraft` | Main package — Page API, Browser, config, CLI. Re-exports BDD. |
| `browsecraft-bdd` | Gherkin parser, step registry, executor, TS-native BDD, hooks, tags |
| `browsecraft-bidi` | WebDriver BiDi protocol client, browser launcher, CDP bridge |
| `browsecraft-runner` | Test file discovery, execution, retry logic, reporter types |
| `browsecraft-ai` | AI features — self-healing selectors, test generation, visual diff |

### BiDi Protocol

Browsecraft uses the W3C WebDriver BiDi protocol to control browsers:

- **Chrome/Edge**: BiDi over CDP (connects to Chrome DevTools Protocol, speaks BiDi)
- **Firefox**: native BiDi support over WebSocket

This means Browsecraft controls real, unpatched browser binaries — no special builds, no browser extensions.

## Browser Support

| Browser | Support | Protocol |
| --- | --- | --- |
| Chrome | Full | BiDi over CDP |
| Edge | Full | BiDi over CDP |
| Firefox | Full | Native BiDi |

## Requirements

- Node.js >= 20.0.0
- Chrome, Edge, or Firefox installed

## License

[MIT](LICENSE)
