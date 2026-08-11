## 2025-01-24 - Pre-compiled Regex over Array.some() for string matching
**Learning:** For high-frequency string matching (like in sanitize routines processing many network events), using `Array.some` with `toLowerCase().includes()` incurs significant overhead from object allocation and iteration.
**Action:** Replace `Array.some` checks with a single, pre-compiled, non-global regular expression (`RegExp.test()`) to improve execution speed by ~6x, ensuring the regex lacks the global `g` flag to avoid stateful false negatives.
