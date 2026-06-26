# Bolt's Journal
## 2024-06-26 - Optimize BiDi message sanitization
**Learning:** In high-frequency string matching (e.g., sanitize routines on network events), replacing `Array.some(keyword => target.toLowerCase().includes(keyword))` with a single pre-compiled, non-global regular expression (`RegExp.test()`) can improve execution speed significantly (~2x in this case) by reducing object allocation and iteration overhead.
**Action:** Use pre-compiled Regex instead of `Array.some` with `.includes` when checking against a fixed list of sensitive keys in hot paths.
