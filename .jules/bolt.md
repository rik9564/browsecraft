## 2026-06-12 - Optimize Array.some with pre-compiled RegExp
**Learning:** Using `Array.some` with `includes` for string matching against a list of keywords inside a frequently executed loop creates unnecessary object allocation and iteration overhead.
**Action:** For high-frequency string matching, replace `Array.some` checks with a single pre-compiled, non-global regular expression (`RegExp.test()`) to improve execution speed by ~3x.
