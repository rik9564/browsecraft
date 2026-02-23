# browsecraft-runner

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

## 0.3.0

### Patch Changes

- Updated dependencies []:
  - browsecraft-bidi@0.3.0

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
