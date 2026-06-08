## 2025-02-12 - Optimize Sensitive Key Matching
**Learning:** High-frequency string matching using `Array.some(keyword => target.includes(keyword))` has significant overhead. Replacing it with a pre-compiled RegExp `.test()` reduces execution time by ~3x in microbenchmarks due to fewer object allocations and iteration overhead.
**Action:** Use pre-compiled non-global RegExp matching instead of array iteration for matching known string sets on hot code paths (e.g., debug log sanitization).
