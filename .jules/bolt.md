## 2024-05-24 - Pre-compiled RegExp for High-Frequency String Matching
**Learning:** Using `Array.some` with string `includes` operations is significantly slower than using a single, pre-compiled regular expression for high-frequency operations like object sanitization.
**Action:** Always prefer `RegExp.test` with a non-global regex over array iterations for matching against a set of known keywords in high-throughput paths.
