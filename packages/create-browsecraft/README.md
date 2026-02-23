# create-browsecraft

[![npm](https://img.shields.io/npm/v/create-browsecraft)](https://www.npmjs.com/package/create-browsecraft)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Scaffold a new [Browsecraft](https://github.com/rik9564/browsecraft) project in seconds. Zero dependencies.

## Usage

```bash
npm init browsecraft
```

That's it. One command scaffolds everything you need:

- `browsecraft.config.ts` — configuration
- `tsconfig.json` — TypeScript setup
- `tests/example.test.ts` — example test you can run immediately
- Installs all dependencies

### BDD Support

```bash
npm init browsecraft -- --bdd
```

This additionally creates:

- `features/example.feature` — example Gherkin feature file
- `steps/steps.ts` — step definitions with 38 built-in steps pre-registered

### Options

```bash
npm init browsecraft my-tests          # Scaffold into a directory
npm init browsecraft -- --js           # JavaScript instead of TypeScript
npm init browsecraft -- --quiet --bdd  # Non-interactive (CI mode)
```

### Other Package Managers

```bash
pnpm create browsecraft
yarn create browsecraft
```

## Requirements

- Node.js 20+
- Chrome, Edge, or Firefox installed on your machine

## What Gets Created

```
my-project/
├── browsecraft.config.ts    # Browser, timeout, viewport settings
├── tsconfig.json            # TypeScript configuration
├── package.json             # Dependencies pre-configured
├── tests/
│   └── example.test.ts      # Working example test
├── features/                # (with --bdd)
│   └── example.feature      # Gherkin feature file
└── steps/                   # (with --bdd)
    └── steps.ts             # Step definitions
```

## After Scaffolding

```bash
npx browsecraft test              # Run all tests
npx browsecraft test --headed     # Watch the browser
npx browsecraft test --bdd        # Run BDD feature files
```

## License

[MIT](LICENSE)
