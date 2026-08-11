## 2024-06-06 - Pre-compiled RegExp vs Array.some()
**Learning:** For high-frequency string matching (like sanitizing objects recursively), replacing `Array.some` checks with a single pre-compiled, non-global regular expression (`RegExp.test()`) significantly reduces object allocation and iteration overhead.
**Action:** Use pre-compiled regular expressions instead of `Array.some` combined with `.includes` when checking multiple keywords in high-frequency loops or recursive utilities.
