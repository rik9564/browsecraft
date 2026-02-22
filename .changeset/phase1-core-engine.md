---
"browsecraft": minor
"browsecraft-bidi": minor
"browsecraft-ai": minor
"browsecraft-bdd": minor
"browsecraft-runner": minor
---

Phase 1: Core Engine Enhancement

- **Rich error classes**: `BrowsecraftError`, `ElementNotFoundError`, `ElementNotActionableError`, `NetworkError`, `TimeoutError` with full diagnostic state, similar element suggestions, and actionable hints
- **Actionability engine**: All interaction methods (click, fill, type, select, check, uncheck, hover, tap, focus, selectOption) now verify elements are visible and enabled before interacting, with rich error messages on failure
- **English API aliases**: `page.go(url)` for navigation, `page.see(text)` for visibility assertions — reads like plain English
- **Network features**: `page.intercept()` for request interception with handlers, `page.waitForResponse()` for response observation, `page.blockRequests()` for blocking patterns (ads, analytics)
- **Enhanced selectors**: Automatic `data-testid`, `data-test`, `data-test-id` attribute detection in locator resolution chain
- **38 built-in BDD steps**: Navigation, click, fill, type, select, check, hover, drag, scroll, press, assertions for visibility/URL/title/element state — zero configuration needed
- **Head element filtering**: Locator now filters out `<title>`, `<meta>`, `<style>`, and other `<head>`-only elements from results, preventing false matches
