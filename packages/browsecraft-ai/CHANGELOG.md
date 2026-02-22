# browsecraft-ai

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
