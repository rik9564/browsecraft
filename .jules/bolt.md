
## 2024-06-29 - Pre-compiled Regex for High-Frequency String Matching
**Learning:** High-frequency string matching (e.g., sanitize routines on network events) using `Array.some(keyword => target.toLowerCase().includes(keyword))` is inefficient due to iteration and object allocation. Replacing it with a single pre-compiled, non-global regular expression (`RegExp.test()`) improves execution speed by ~6x.
**Action:** Use pre-compiled, non-global regular expressions instead of `Array.some` with `includes` for frequent string matching checks.
