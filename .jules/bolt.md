## 2024-05-24 - Optimization Pattern: Avoid multiple O(N) Array.filter() calls
**Learning:** The codebase previously contained instances of calculating test result statistics (e.g. passed, failed, skipped counts, total duration) by chaining multiple `.filter().length` and `.reduce()` operations on the same array in `scheduler.ts` and `runner.ts`. This required N+1 traversals over the same result array and intermediate array allocations, which is inefficient for large datasets.
**Action:** Replaced these redundant array iterations with a single `for` loop that tallies all required metrics simultaneously in an O(N) pass, saving CPU cycles and memory allocation.

## 2024-05-24 - CI Smoke Test Failure: Missing X Server
**Learning:** The GitHub CI environment (Ubuntu) does not have a display server configured by default. Running tests with `{ headless: false }` causes Chrome to crash immediately with a `Missing X server or $DISPLAY` error.
**Action:** Always ensure that tests executed in CI environments (like the `tests/smoke.mjs` test suite) instantiate the browser with `{ headless: true }`.
