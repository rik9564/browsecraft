## 2024-05-01 - Single-pass stats aggregation
**Learning:** Avoid N+1 array iterations on the same data set (e.g., multiple `Array.filter().length` and `Array.reduce()` calls) when calculating test summary statistics.
**Action:** Instead, calculate multiple statistics in a single O(N) `for` loop to prevent redundant traversals and intermediate array allocations.
