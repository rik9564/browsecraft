
## 2024-05-18 - [O(N) single-pass optimizations]
**Learning:** Using multiple array `.filter(...).length` computations to calculate test stats traverses the result set multiple times. This N+1 array iteration anti-pattern causes redundant traversals and object allocations, performing suboptimally especially with large result sets.
**Action:** Calculate multiple statistics in a single O(N) `for` loop to avoid redundant traversals and intermediate array allocations.
