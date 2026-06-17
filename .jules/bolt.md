## 2025-02-13 - Pre-compiled Regex for High-Frequency String Matching
**Learning:** In high-frequency operations like deep object sanitization, iterating over an array of substrings using `Array.some(keyword => target.includes(keyword))` creates unnecessary allocation and iteration overhead.
**Action:** Replace substring array iteration with a single pre-compiled, non-global regular expression (`RegExp.test()`) to improve execution speed by ~3x. Avoid using the global `g` flag to prevent `lastIndex` state issues.
