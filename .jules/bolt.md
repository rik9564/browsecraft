## 2024-07-10 - Optimize sanitize utility with RegExp
**Learning:** For high-frequency string matching (e.g., sanitize routines on network events), replacing `Array.some(keyword => target.toLowerCase().includes(keyword))` with a single pre-compiled, non-global regular expression (`RegExp.test()`) can improve execution speed by ~6x by reducing object allocation and iteration overhead.
**Action:** Use pre-compiled Regex for high-frequency string matching instead of iterating over an array.
