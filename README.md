# Browsecraft

Browser automation that just works. No CSS selectors required.

Browsecraft is a browser automation and testing framework built from scratch on the W3C WebDriver BiDi protocol. It controls real, unpatched browsers with an API designed for humans.

```ts
import { test, expect } from 'browsecraft';

test('add to cart', async ({ page }) => {
  await page.goto('https://shop.example.com');
  await page.click('Add to Cart');
  await page.click('Checkout');
  await expect(page).toHaveURL(/checkout/);
});
```

## Why Browsecraft?

- **No selectors needed** — `page.click('Submit')` finds buttons by visible text, aria-label, or role. CSS/XPath is an escape hatch, not the default.
- **Zero config** — `npx browsecraft test` runs your tests. No config file, no setup wizard.
- **Built on BiDi** — uses the W3C WebDriver BiDi protocol for first-class browser control. Not a CDP wrapper.
- **AI-native (optional)** — self-healing selectors, natural language test generation, and visual regression powered by local AI (Ollama). Works perfectly without it.
- **TypeScript-first** — written in TypeScript with full type safety. JavaScript works too.

## Quick Start

```bash
npm install browsecraft
```

Write a test:

```ts
// tests/login.test.ts
import { test, expect } from 'browsecraft';

test('user can log in', async ({ page }) => {
  await page.goto('https://myapp.com/login');
  await page.fill('#email', 'user@example.com');
  await page.fill('#password', 'password123');
  await page.click('Sign In');

  await expect(page).toHaveURL('/dashboard');
  await expect(page).toHaveTitle('Dashboard');
});
```

Run it:

```bash
npx browsecraft test
```

## API Reference

### Navigation

```ts
await page.goto('https://example.com');
await page.waitForURL(/dashboard/);
await page.waitForLoadState();          // 'load' | 'domcontentloaded' | 'networkidle'
```

### Actions

```ts
// Click — finds by visible text, aria-label, or CSS
await page.click('Submit');
await page.click('[data-testid="btn"]');

// Fill — works with React, Vue, Angular controlled inputs
await page.fill('#email', 'user@example.com');

// Type — character by character (real keyboard events)
await page.type('#search', 'browsecraft');

// Other actions
await page.check('#agree');
await page.hover('.menu-item');
await page.dblclick('.editable');
await page.tap('.mobile-button');
await page.focus('#input');
await page.blur('#input');
await page.select('#country', 'US');
await page.selectOption('#multi', ['a', 'b', 'c']);
```

### Selectors

Browsecraft uses a smart resolution chain. Pass a string and it will try:

1. **Accessibility** — aria-label, role, alt text
2. **Visible text** — button text, link text, label text
3. **CSS selector** — as a fallback

```ts
// All of these find the same button:
await page.click('Submit');                    // by visible text
await page.click('[aria-label="Submit"]');     // by aria-label
await page.click('button.submit-btn');         // by CSS

// Object form for precision:
await page.click({ text: 'Submit', tag: 'button' });
```

### Assertions

All assertions auto-retry with configurable timeout:

```ts
import { expect } from 'browsecraft';

// Page assertions
await expect(page).toHaveTitle('Dashboard');
await expect(page).toHaveURL(/\/dashboard/);
await expect(page).toHaveContent('Welcome back');

// Element assertions
const button = await page.getByText('Submit');
await expect(button).toBeVisible();
await expect(button).toBeEnabled();
await expect(button).toHaveText('Submit');
await expect(button).toHaveAttribute('type', 'submit');
await expect(button).toHaveCSS('color', 'rgb(255, 0, 0)');
await expect(button).toHaveCount(1);

// Negation
await expect(button).not.toBeVisible();
```

### Screenshots

```ts
// Full page
await page.screenshot('screenshots/home.png');

// Element-level
const card = await page.getByText('Product');
await card.screenshot('screenshots/product-card.png');
```

### Evaluate

Run JavaScript in the browser:

```ts
const count = await page.evaluate(() => {
  return document.querySelectorAll('.item').length;
});
```

### Browser & Contexts

```ts
import { Browser } from 'browsecraft';

const browser = await Browser.launch('chrome');  // 'chrome' | 'firefox' | 'edge'
const page = await browser.newPage();

// Multiple pages
const page2 = await browser.newPage();

await browser.close();
```

### Waiting

```ts
await page.waitForSelector('.loaded');
await page.waitForSelector('.modal', { state: 'hidden' });
await page.waitForURL(/success/);
await page.waitForFunction(() => window.appReady === true);
```

### Dialog Handling

```ts
page.onDialog(async (dialog) => {
  console.log(dialog.message);
  await dialog.accept('yes');
});
```

### Network Mocking

```ts
await page.mock('**/api/users', {
  status: 200,
  body: JSON.stringify([{ name: 'Alice' }]),
});
```

## AI Features (Optional)

AI features require [Ollama](https://ollama.ai) running locally. Everything works perfectly without it.

```bash
# Install Ollama, then pull a model:
ollama pull llama3.1
```

### Self-Healing Selectors

When a selector breaks (e.g., after a UI refactor), Browsecraft can suggest a replacement:

```ts
import { healSelector } from 'browsecraft-ai';

const result = await healSelector('#old-submit-btn', pageSnapshot, {
  context: 'login form submit button',
});

if (result.healed) {
  console.log(`Try: ${result.selector} (${result.confidence * 100}% confidence)`);
  // method: 'ai' | 'text-similarity' | 'attribute-match'
}
```

Works without AI using text similarity and attribute matching. Better with AI.

### Test Generation

Generate test code from natural language:

```ts
import { generateTest } from 'browsecraft-ai';

const result = await generateTest({
  description: 'Test that a user can log in and see the dashboard',
  url: 'https://myapp.com/login',
});

console.log(result.code);
// import { test, expect } from 'browsecraft';
// test('user can log in and see the dashboard', async ({ page }) => { ...
```

Falls back to a template with TODO comments when Ollama is unavailable.

### Visual Regression

Compare screenshots pixel-by-pixel with optional AI-powered semantic analysis:

```ts
import { compareScreenshots } from 'browsecraft-ai';

const result = await compareScreenshots('baseline.png', 'current.png', {
  threshold: 5,           // per-channel tolerance (0-255)
  maxDiffPercent: 0.1,    // max allowed diff percentage
  diffOutputPath: 'diff.png',
  antiAlias: true,        // ignore anti-aliasing differences
  ignoreRegions: [        // skip dynamic regions
    { x: 0, y: 0, width: 200, height: 50 },
  ],
});

if (!result.match) {
  console.log(`${result.diffPercent.toFixed(2)}% pixels differ`);
}
```

Zero dependencies — parses PNG buffers directly.

## Configuration

Browsecraft works with zero configuration. For customization, use `defineConfig()`:

```ts
// browsecraft.config.ts
import { defineConfig } from 'browsecraft';

export default defineConfig({
  browser: 'chrome',
  headless: true,
  timeout: 30_000,
  retries: 2,
  testDir: './tests',
  screenshot: 'on-failure',
});
```

## Architecture

Browsecraft is a monorepo with four packages:

| Package | Description |
| --- | --- |
| `browsecraft` | Main package — Page API, assertions, test runner, CLI |
| `browsecraft-bidi` | WebDriver BiDi protocol client, browser launcher, CDP bridge |
| `browsecraft-runner` | Test file discovery, execution, retry logic, colored output |
| `browsecraft-ai` | AI features — self-healing, test generation, visual diff |

### BiDi Protocol

Browsecraft uses the W3C WebDriver BiDi protocol to control browsers:

- **Firefox**: native BiDi support over WebSocket
- **Chrome/Edge**: BiDi via `chromium-bidi` mapper (translates BiDi to CDP in-process)

This means Browsecraft controls real, unpatched browser binaries — no special builds, no browser extensions.

## Browser Support

| Browser | Support | Protocol |
| --- | --- | --- |
| Chrome | Full | BiDi via CDP bridge |
| Edge | Full | BiDi via CDP bridge |
| Firefox | Full | Native BiDi |

## License

[MIT](LICENSE)
