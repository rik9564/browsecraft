# create-browsecraft

## 0.6.0

### Minor Changes

- [`1eef842`](https://github.com/rik9564/browsecraft/commit/1eef842c1e89a07f0b6445f1b36ba9b044be7384) Thanks [@rik9564](https://github.com/rik9564)! - - Added runtime AI steps mode (`--ai-steps`) with support for auto, locked, and warm modes.
  - Fixed window positioning in headed mode via raw CDP commands.
  - Redesigned orphan tab cleanup and fixed `page.fill/type/select` matching behavior.

## 0.5.1

### Patch Changes

- feat: add `bdd` as first-class CLI subcommand (`npx browsecraft bdd`)
  fix: show error details when BDD scenarios fail with 0 steps
  fix: add `types: [node]` to root tsconfig resolving 160 IDE errors

## 0.5.0

### Minor Changes

- ### New Features

  - **Self-healing selectors** — automatically suggests replacement selectors when CSS selectors break, using AI or heuristic fallback
  - **Adaptive timing** — auto-adjusts timeouts based on observed action performance
  - **Failure classification & smart retry** — categorizes failures (network/timeout/element/assertion/script) and only retries those that might succeed
  - **AI failure diagnosis** — analyzes test failures with page context and suggests fixes
  - **Persistent AI cache** — caches AI results on disk to avoid redundant API calls
  - **Confidence gating** — only applies AI suggestions above a configurable threshold
  - **BDD parallel execution** — distribute scenarios across multi-browser worker pools with `parallel`, `sequential`, and `matrix` strategies
  - **Scenario filtering** — `--scenario`, `--grep`, `--tag`, and `feature.feature:15` line-number targeting
  - **`scenarioFilter` callback** — programmatic scenario filtering with `(name, tags, uri?)` signature
  - **IDE integration** — `npx browsecraft setup-ide` generates VS Code/Cucumber config for zero-config step discovery
  - **38 built-in BDD steps** — pre-built step definitions for navigation, forms, visibility, URLs, waiting, screenshots, and more

  ### Improvements

  - Eliminated all `noExplicitAny` lint warnings with proper types
  - Added `BddPage` duck-typed interface for built-in steps (avoids circular dependency)
  - Added `.gitattributes` to enforce LF line endings across platforms
  - Fixed all Biome lint errors (CRLF formatting, `useTemplate` violations)
  - Updated all READMEs with comprehensive documentation for new features

## 0.4.0

### Minor Changes

- [`049d757`](https://github.com/rik9564/browsecraft/commit/049d7578e0ba05f90f0fd0c16b3d5a44653fd7a9) Thanks [@rik9564](https://github.com/rik9564)! - Add BDD CLI mode (`browsecraft test --bdd`), fix double browser window in headed mode, fix thenable module bug

  ### New Features

  - **BDD CLI mode**: `browsecraft test --bdd` discovers `.feature` files, loads step definitions, registers built-in steps, launches browser, and runs scenarios with full BDD-style output
  - **BddConfig**: New `bdd` configuration option in `browsecraft.config.ts` for specifying feature/step file paths and enabling built-in steps

  ### Bug Fixes

  - **Double browser window**: Headed mode no longer opens two browser windows. The initial `about:blank` tab is reused by `newPage()` instead of creating a second tab
  - **Thenable module bug**: Renamed `then` export to `thenStep` in `browsecraft-bdd` and `browsecraft` to prevent Node.js from treating ES modules as thenables during dynamic import
  - **create-browsecraft**: Fixed scaffolded feature template step patterns to match built-in step definitions

## 0.3.0

### Minor Changes

- [`27384e8`](https://github.com/rik9564/browsecraft/commit/27384e87ff88f668fff7d7648000a396c408e6d2) Thanks [@rik9564](https://github.com/rik9564)! - Add create-browsecraft scaffolding CLI and update documentation

  - New `create-browsecraft` package: `npm init browsecraft` scaffolds a complete project with zero config
  - Supports `--bdd`, `--js`, `--quiet` flags and target directory
  - README: added network interception, actionability, error types, built-in BDD steps, page.go/page.see docs
  - Architecture updated from 5 to 6 packages
  - CONTRIBUTING: added create-browsecraft to project structure, updated test count to 102
