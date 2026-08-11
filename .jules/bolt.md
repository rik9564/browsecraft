## 2024-05-18 - Avoid N+1 array iterations in status counting
**Learning:** Found multiple instances where array iterations (`filter().length`) were used repeatedly to count statuses (passed, failed, skipped), leading to redundant array allocations and unnecessary O(N) operations.
**Action:** Replace multiple `filter().length` with a single O(N) pass (`for` loop or `reduce`) when counting statuses to prevent redundant array traversals and allocations.
