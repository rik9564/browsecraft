
## 2024-03-01 - Optimize Object Sanitization
**Learning:** For high-frequency string matching on object keys (e.g., recursive JSON redacting), `RegExp.test` with a single precompiled pattern is significantly faster (~1.5x speedup) than mapping `.toLowerCase()` and iterating via `Array.some(str.includes)` because it eliminates multiple string and closure allocations per key check.
**Action:** When searching for multiple keywords across strings synchronously and frequently in Node, prefer a compiled regex over native array mapping/iteration methods.
