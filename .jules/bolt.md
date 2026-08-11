## 2026-04-12 - Array filter length optimization
**Learning:** Avoid N+1 array iterations on the same data set (e.g., multiple `Array.filter().length` calls). Using multiple `.filter(pred).length` calls traverses the same array redundantly and allocates intermediate arrays.
**Action:** Calculate multiple statistics (like counts of 'passed', 'failed', 'skipped') in a single O(N) `for` loop to prevent redundant traversals and intermediate array allocations.
