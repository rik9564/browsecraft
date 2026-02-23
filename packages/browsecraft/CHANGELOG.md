# browsecraft

## 0.6.3

### Patch Changes

- 67ae0e6: Fix cross-origin click navigation causing "Cannot find context with specified id" errors. `page.url()`, `page.title()`, and `page.content()` now retry on transient context errors during cross-origin navigation. BDD URL and title assertion steps now poll until the navigation completes.
- Updated dependencies [67ae0e6]
  - browsecraft-bdd@0.6.3
  - browsecraft-bidi@0.6.3
  - browsecraft-runner@0.6.3

## 0.6.2

### Patch Changes

- 7bc555c: Fixed CLI flag values being treated as file paths. The `--scenario`, `--grep`, and other flags with values (e.g. `--scenario "Page loads with correct title"`) no longer cause "No matching feature files found" errors. Also made `--version` output dynamic from package.json instead of hardcoded.
  - browsecraft-bidi@0.6.2
  - browsecraft-bdd@0.6.2
  - browsecraft-runner@0.6.2

## 0.6.1

### Patch Changes

- Fix AI step execution: add case-insensitive accessible name fallback in locator and improve AI prompt for case sensitivity and page navigation patterns

- Updated dependencies []:
  - browsecraft-bdd@0.6.1
  - browsecraft-bidi@0.6.1
  - browsecraft-runner@0.6.1

## 0.6.0

### Minor Changes

- [`1eef842`](https://github.com/rik9564/browsecraft/commit/1eef842c1e89a07f0b6445f1b36ba9b044be7384) Thanks [@rik9564](https://github.com/rik9564)! - - Added runtime AI steps mode (`--ai-steps`) with support for auto, locked, and warm modes.
  - Fixed window positioning in headed mode via raw CDP commands.
  - Redesigned orphan tab cleanup and fixed `page.fill/type/select` matching behavior.

### Patch Changes

- Updated dependencies [[`1eef842`](https://github.com/rik9564/browsecraft/commit/1eef842c1e89a07f0b6445f1b36ba9b044be7384)]:
  - browsecraft-bdd@0.6.0
  - browsecraft-bidi@0.6.0
  - browsecraft-runner@0.6.0

## 0.5.1

### Patch Changes

- feat: add `bdd` as first-class CLI subcommand (`npx browsecraft bdd`)
  fix: show error details when BDD scenarios fail with 0 steps
  fix: add `types: [node]` to root tsconfig resolving 160 IDE errors
- Updated dependencies []:
  - browsecraft-bdd@0.5.1
  - browsecraft-bidi@0.5.1
  - browsecraft-runner@0.5.1

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

### Patch Changes

- Updated dependencies []:
  - browsecraft-bdd@0.5.0
  - browsecraft-bidi@0.5.0
  - browsecraft-runner@0.5.0

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

- [`a557648`](https://github.com/rik9564/browsecraft/commit/a5576485e902b83f9cc205b28d88e60cc1b607ec) Thanks [@rik9564](https://github.com/rik9564)! - Multi-browser parallel execution engine

  Added scenario-level parallelism across Chrome, Firefox, and Edge. New modules:

  - **EventBus** — type-safe, synchronous event system for the execution lifecycle
  - **WorkerPool** — work-stealing browser instance pool with retry and bail support
  - **Scheduler** — three execution strategies: parallel, sequential, matrix
  - **ResultAggregator** — scenario × browser matrix, flaky detection, cross-browser inconsistency, timing stats

  New config fields: `browsers` and `strategy`.

### Patch Changes

- Updated dependencies [[`049d757`](https://github.com/rik9564/browsecraft/commit/049d7578e0ba05f90f0fd0c16b3d5a44653fd7a9), [`a557648`](https://github.com/rik9564/browsecraft/commit/a5576485e902b83f9cc205b28d88e60cc1b607ec)]:
  - browsecraft-bdd@0.4.0
  - browsecraft-bidi@0.4.0
  - browsecraft-runner@0.4.0

## 0.3.0

### Minor Changes

- [`27384e8`](https://github.com/rik9564/browsecraft/commit/27384e87ff88f668fff7d7648000a396c408e6d2) Thanks [@rik9564](https://github.com/rik9564)! - Add create-browsecraft scaffolding CLI and update documentation

  - New `create-browsecraft` package: `npm init browsecraft` scaffolds a complete project with zero config
  - Supports `--bdd`, `--js`, `--quiet` flags and target directory
  - README: added network interception, actionability, error types, built-in BDD steps, page.go/page.see docs
  - Architecture updated from 5 to 6 packages
  - CONTRIBUTING: added create-browsecraft to project structure, updated test count to 102

### Patch Changes

- Updated dependencies []:
  - browsecraft-bidi@0.3.0
  - browsecraft-bdd@0.3.0
  - browsecraft-runner@0.3.0

## 0.2.0

### Minor Changes

- [`97761b5`](https://github.com/rik9564/browsecraft/commit/97761b587a3b68f6b332da97eab476d3257db3ec) Thanks [@rik9564](https://github.com/rik9564)! - Phase 1: Core Engine Enhancement

  - **Rich error classes**: `BrowsecraftError`, `ElementNotFoundError`, `ElementNotActionableError`, `NetworkError`, `TimeoutError` with full diagnostic state, similar element suggestions, and actionable hints
  - **Actionability engine**: All interaction methods (click, fill, type, select, check, uncheck, hover, tap, focus, selectOption) now verify elements are visible and enabled before interacting, with rich error messages on failure
  - **English API aliases**: `page.go(url)` for navigation, `page.see(text)` for visibility assertions — reads like plain English
  - **Network features**: `page.intercept()` for request interception with handlers, `page.waitForResponse()` for response observation, `page.blockRequests()` for blocking patterns (ads, analytics)
  - **Enhanced selectors**: Automatic `data-testid`, `data-test`, `data-test-id` attribute detection in locator resolution chain
  - **38 built-in BDD steps**: Navigation, click, fill, type, select, check, hover, drag, scroll, press, assertions for visibility/URL/title/element state — zero configuration needed
  - **Head element filtering**: Locator now filters out `<title>`, `<meta>`, `<style>`, and other `<head>`-only elements from results, preventing false matches

### Patch Changes

- Updated dependencies [[`97761b5`](https://github.com/rik9564/browsecraft/commit/97761b587a3b68f6b332da97eab476d3257db3ec)]:
  - browsecraft-bidi@0.2.0
  - browsecraft-bdd@0.2.0
  - browsecraft-runner@0.2.0
