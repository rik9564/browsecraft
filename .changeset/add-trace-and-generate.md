---
"browsecraft": minor
"browsecraft-ai": patch
---

Add trace recording and an interactive trace viewer: `config.trace` records a step-by-step timeline (screenshots, bounding boxes, page URLs, and full DOM snapshots) for each test, and `browsecraft show-trace <path>` opens a self-contained HTML viewer with playback controls, a Gantt-style timeline, an animated cursor/highlight over the acted-on element, and a DOM inspection mode for hovering/inspecting the real captured page.

Also adds:
- `browsecraft generate "<description>"` — generate a test file from a plain-English description, backed by `browsecraft-ai`'s existing `generateTest()`.
- `expect(page).toMatchSnapshot(name)` — visual regression matcher backed by `browsecraft-ai`'s existing `compareScreenshots()`, with baseline auto-recording and optional AI-assisted semantic comparison.
- `browsecraft-ai` is now a bundled dependency of `browsecraft` (previously an optional peer requiring a separate install), so AI-assisted generation, self-healing, and snapshot diffing work out of the box.

Also fixes a bug where `browsecraft.config.ts` settings beyond browser-launch options (`baseURL`, `trace`, `screenshot`, `ai`, `retries`) were silently dropped by the CLI's test runner, because the resolved config was never passed through to `Browser.launch()` or `runTest()`.
