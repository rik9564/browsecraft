# Bolt's Performance Journal

## 2024-04-28 - Optimize array iterations in test runners
**Learning:** Test result aggregation in `Scheduler` often involves multiple `.filter().length` and `.reduce()` calls over the exact same array, causing redundant O(N) traversals and unnecessary memory allocations.
**Action:** Replace multiple `.filter().length` and `.reduce()` calls with a single O(N) `for` loop to compute statistics simultaneously.
