
## 2025-03-09 - Avoid Multiple N+1 Array Iterations for Status Counts
**Learning:** In test runners like `browsecraft-runner`, test result summaries frequently compute counts for `passed`, `failed`, and `skipped` tests. Doing this with multiple `results.filter(r => r.status === 'X').length` calls results in redundant intermediate array allocations and O(N) traversals over the same result set.
**Action:** Replace multiple `.filter().length` and `.reduce()` calls on the same array with a single `for...of` loop or a single `reduce` pass that calculates all statistics in O(N) time without intermediate array allocations.
