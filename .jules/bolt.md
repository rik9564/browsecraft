## 2026-04-03 - Avoiding Redundant Array Iterations in Test Results
**Learning:** Found an anti-pattern in the test runner's reporting layer where arrays of results were traversed multiple times (N+1 array iterations) to calculate separate counts for `passed`, `failed`, and `skipped` tests using `Array.filter().length`. This can become a performance bottleneck with large test suites.
**Action:** Replace multiple `Array.filter().length` and `Array.reduce()` passes with a single O(N) loop over the results array to calculate all counts and durations simultaneously.
