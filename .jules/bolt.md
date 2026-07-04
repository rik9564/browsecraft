## 2025-05-24 - Pre-compiled RegExp for high-frequency string matching
**Learning:** For high-frequency string matching (e.g., sanitize routines on network events), replacing `Array.some(keyword => target.toLowerCase().includes(keyword))` with a single pre-compiled, non-global regular expression (`RegExp.test()`) can improve execution speed significantly (~6x) by reducing object allocation and iteration overhead.
**Action:** Always prefer pre-compiled, non-global regular expressions for frequent, simple substring checks rather than mapping or iterating over arrays of strings.
