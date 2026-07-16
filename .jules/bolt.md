## 2024-07-16 - Pre-compiled Regex for Sanitize Optimization
**Learning:** High-frequency string matching (e.g., sanitize routines on network events) using `Array.some(keyword => target.toLowerCase().includes(keyword))` has noticeable object allocation and iteration overhead.
**Action:** Replace `Array.some` checks with a single pre-compiled, non-global regular expression (`RegExp.test()`) to improve execution speed by ~6x.
