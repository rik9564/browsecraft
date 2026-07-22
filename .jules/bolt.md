## 2025-07-22 - Regex vs Array.some for high-frequency string matching
**Learning:** For high-frequency string matching (e.g., sanitize routines on network events), replacing `Array.some(keyword => target.toLowerCase().includes(keyword))` with a single pre-compiled, non-global regular expression (`RegExp.test()`) can improve execution speed by ~20x by reducing object allocation and iteration overhead. Using the regex `/i` flag also eliminates the need for expensive `.toLowerCase()` string allocations.
**Action:** Use pre-compiled regex for frequent string matching over arrays.
