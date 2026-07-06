## 2024-07-06 - High-Frequency String Matching Optimization
**Learning:** In high-frequency operations like network event sanitization (e.g., `sanitize` in `browsecraft-bidi`), using `Array.some()` with `toLowerCase().includes()` creates significant overhead due to object allocation and iteration.
**Action:** Replace array iteration with a single pre-compiled, non-global regular expression (e.g., `/(?:key1|key2)/i.test()`) to improve execution speed by ~6x. Avoid the global `g` flag to prevent state-related false negatives.
