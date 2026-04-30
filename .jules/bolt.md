## 2025-05-19 - Avoid redundant array passes in results processing
**Learning:** Found multiple places in `scheduler.ts` where arrays of results were being iterated multiple times using `.filter().length` and `.reduce()` to compute passing/failing/skipped counts and total duration. This causes unnecessary intermediate array allocations and redundant O(N) traversals.
**Action:** Replace multiple `.filter()`/`.reduce()` calls with a single helper method `getResultStats()` that iterates the results once using a `for...of` loop to compute all required aggregate values simultaneously.
