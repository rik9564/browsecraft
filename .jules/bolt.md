## 2024-05-18 - Optimize Array Traversals
**Learning:** In `browsecraft-runner`, test results are summarized using multiple `Array.filter().length` and `Array.reduce()` calls. This results in an N+1 iteration problem over potentially large arrays of test results. Re-iterating identical result arrays is an anti-pattern when extracting aggregate stats.
**Action:** Use a single `for...of` loop to calculate multiple statistical counts (passed, failed, skipped, duration) in one O(N) pass, avoiding redundant array allocations and improving performance by ~10x on these operations.
