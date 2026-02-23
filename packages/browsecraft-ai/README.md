# browsecraft-ai

AI-powered self-healing, test generation, and visual regression for [Browsecraft](https://github.com/rik9564/browsecraft).

Uses the [GitHub Models API](https://github.com/marketplace/models) — free with any GitHub account. All features degrade gracefully when no token is available, falling back to heuristic-based approaches.

## Install

```bash
npm install browsecraft-ai
```

## Setup

Set a GitHub personal access token with the `models` scope:

```bash
export GITHUB_TOKEN=ghp_...
```

Everything works without a token — AI just makes it better.

## Features

### Self-Healing Selectors

When a CSS selector breaks, suggests a replacement using page context.

```js
import { healSelector } from 'browsecraft-ai';

const result = await healSelector('.old-button-class', {
  url: 'https://example.com',
  title: 'My Page',
  elements: [
    { tag: 'button', text: 'Submit', attributes: { class: 'new-btn', id: 'submit' } },
    // ... page elements
  ],
});

console.log(result.selector);   // '.new-btn' or '#submit'
console.log(result.confidence); // 0.0 - 1.0
console.log(result.method);    // 'ai' | 'text-similarity' | 'attribute-match'
```

**Without AI:** Uses Levenshtein distance and attribute similarity heuristics.
**With AI:** Sends page snapshot to GitHub Models for intelligent matching.

### Test Generation

Generates Browsecraft test code from a natural-language description.

```js
import { generateTest } from 'browsecraft-ai';

const result = await generateTest({
  description: 'Log in and verify the dashboard loads',
  url: 'https://myapp.com/login',
  style: 'script', // 'browsecraft' | 'script'
});

console.log(result.code);        // Complete, runnable test code
console.log(result.aiGenerated); // true if AI was used
```

**Without AI:** Generates a template skeleton with TODO comments.

### Visual Regression

Compares screenshots pixel-by-pixel, with optional AI semantic analysis.

```js
import { compareScreenshots } from 'browsecraft-ai';

const result = await compareScreenshots('baseline.png', 'current.png', {
  maxDiffPercent: 1.0,
  diffOutputPath: 'diff.png',
  useAI: true,           // optional: use GPT-4o vision for semantic comparison
  antiAlias: true,        // ignore anti-aliasing differences
  ignoreRegions: [        // ignore dynamic content areas
    { x: 0, y: 0, width: 200, height: 50 },
  ],
});

console.log(result.match);       // true/false
console.log(result.diffPercent); // 0.42
console.log(result.aiAnalysis);  // AI explanation (if useAI: true)
```

Zero external dependencies — uses a built-in PNG decoder/encoder.

### AI Failure Diagnosis

Analyze test failures with page context to get actionable fix suggestions.

```js
import { diagnoseFailure } from 'browsecraft-ai';

const diagnosis = await diagnoseFailure(error, {
  url: 'https://example.com',
  title: 'Login Page',
  pageSnapshot: '<html>...</html>',
});

if (diagnosis) {
  console.log(diagnosis.suggestion);  // "The button is disabled. Wait for form validation."
  console.log(diagnosis.confidence);  // 0.85
}
```

Returns `null` when no AI provider is configured — never throws.

### Persistent AI Cache

AI results are cached on disk to avoid redundant API calls. Cache entries are keyed by input hash and automatically reused across test runs.

## API Reference

### Functions

| Function | Description |
|----------|-------------|
| `healSelector(failedSelector, snapshot, options?)` | Suggest a replacement for a broken CSS selector |
| `diagnoseFailure(error, context?)` | AI-powered failure analysis with fix suggestions |
| `generateTest(options)` | Generate test code from natural language |
| `compareScreenshots(baseline, current, options?)` | Pixel-by-pixel screenshot comparison |
| `isGitHubModelsAvailable(token?)` | Check if the GitHub Models API is reachable |
| `detectCapabilities(token?)` | Discover available AI capabilities |
| `githubModelsChat(messages, options?)` | Send a chat completion request |
| `githubModelsGenerate(prompt, options?)` | Generate text from a prompt |
| `resolveToken(token?)` | Resolve a GitHub token from env or explicit value |

## License

[MIT](LICENSE)
