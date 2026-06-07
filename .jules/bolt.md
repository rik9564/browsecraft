## 2025-02-18 - Pre-compiled Regex for High-Frequency String Matching
**Learning:** Using `Array.some()` with `String.includes()` for high-frequency string matching against multiple keywords is inefficient. Replacing it with a single, pre-compiled, non-global regular expression (`RegExp.test()`) reduces object allocation and iteration overhead, improving execution speed significantly (measured ~10x speedup).
**Action:** Prioritize pre-compiled regular expressions over iterative array methods for frequent checks, especially in sanitization or logging paths.
