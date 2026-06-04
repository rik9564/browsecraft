## 2025-02-12 - Optimize high-frequency string matching
**Learning:** For high-frequency string matching (like in object sanitization), `Array.some(keyword => target.includes(keyword))` is significantly slower than using a pre-compiled non-global regular expression (`RegExp.test()`) due to object allocation and iteration overhead. My benchmark showed a ~3x speedup.
**Action:** Use pre-compiled regex for frequent string/keyword existence checks instead of array iteration.
