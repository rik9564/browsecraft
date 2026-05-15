## 2024-05-15 - RegExp optimization
**Learning:** Using `Array.some(str.includes)` for high-frequency string matching causes performance issues.
**Action:** Pre-compile RegExp and use `RegExp.test()` instead.
