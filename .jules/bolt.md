
## 2024-05-24 - Pre-compiled Regex for high-frequency sanitization
**Learning:** In high-frequency operations like network event sanitization (`sanitize` in `browsecraft-bidi`), using `Array.some` with string `includes` checks creates measurable overhead due to function allocations and array iteration.
**Action:** Use a pre-compiled, non-global Regular Expression (`RegExp.test()`) to replace `Array.some` checks on string matching for a significant (~50%+) speedup. Avoid the global `g` flag to prevent stateful `lastIndex` bugs.
