# browsecraft-bdd

Built-in BDD framework for [Browsecraft](https://github.com/rik9564/browsecraft). Gherkin parser, step definitions, hooks, executor, TypeScript-native BDD, and AI auto-step generation — all custom-built with zero third-party dependencies.

No Cucumber. No external parsers. Everything is built in.

## Install

```bash
npm install browsecraft-bdd
```

## Two Ways to Write BDD Tests

### Option 1: Gherkin `.feature` Files

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

### Option 2: TypeScript-Native BDD

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

## Gherkin Parser

The built-in parser supports the full Gherkin spec:

- Scenario Outlines with Examples tables
- Background steps
- Data Tables and Doc Strings
- Tags on features and scenarios
- Rules
- Comments
- [70+ languages](https://cucumber.io/docs/gherkin/languages/) (English, Spanish, French, German, Japanese, and more)

```js
import { parseGherkin } from 'browsecraft-bdd';

const doc = parseGherkin(featureSource);
// doc.feature.name, doc.feature.children, etc.
```

## Step Definitions

Register steps using `{string}`, `{int}`, `{float}`, `{word}` placeholders:

```js
import { Given, When, Then } from 'browsecraft-bdd';

Given('I have {int} items in my cart', async (world, count) => {
  // count is parsed as a number
});

When('I search for {string}', async (world, query) => {
  await world.page.fill('Search', query);
});
```

Custom parameter types:

```js
import { defineParameterType } from 'browsecraft-bdd';

defineParameterType({
  name: 'color',
  regexp: /red|green|blue/,
  transformer: (s) => s,
});

Then('the button should be {color}', async (world, color) => { /* ... */ });
```

## Tags

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

## Hooks

```js
import { Before, After, BeforeAll, AfterAll, BeforeStep, AfterStep } from 'browsecraft-bdd';

BeforeAll(async () => { /* one-time setup */ });
AfterAll(async () => { /* one-time teardown */ });
Before(async (ctx) => { /* before each scenario */ });
After(async (ctx) => { /* after each scenario */ });
BeforeStep(async (ctx) => { /* before each step */ });
AfterStep(async (ctx) => { /* after each step */ });

// Tag-scoped hooks
Before('@login', async (ctx) => { /* only for @login scenarios */ });
```

## AI Auto-Step Generation

Automatically generate step definitions from `.feature` files using the GitHub Models API.

```js
import { autoGenerateSteps } from 'browsecraft-bdd';

const result = await autoGenerateSteps(featureSource, {
  appContext: 'An e-commerce site with login and cart features',
});

console.log(result.fileContent); // Complete step definition file
console.log(result.aiGenerated); // true if AI was used
```

Requires `GITHUB_TOKEN` with `models` scope. Falls back to stub generation with TODO comments when unavailable.

## License

[MIT](LICENSE)
