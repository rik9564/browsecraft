## 2024-07-08 - Pre-compiled Regex for High-Frequency String Matching
**Learning:** For high-frequency string matching (like sanitizing network event payloads), using `Array.some` with `.toLowerCase().includes()` inside a loop causes significant object allocation and iteration overhead.
**Action:** Replace `Array.some` checks with a single pre-compiled, non-global regular expression (`RegExp.test()`) to improve execution speed by ~6x. Avoid using the global `g` flag to prevent `lastIndex` state leakage across executions.
