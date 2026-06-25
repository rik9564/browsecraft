## 2025-06-25 - High-frequency String Matching Optimization
**Learning:** For high-frequency string matching (e.g., sanitize routines on network events), replacing `Array.some(keyword => target.toLowerCase().includes(keyword))` with a single pre-compiled, non-global regular expression (`RegExp.test()`) can improve execution speed by ~6x by reducing object allocation and iteration overhead.
**Action:** Always consider pre-compiled regex for arrays of simple substring matches that execute in hot paths.
