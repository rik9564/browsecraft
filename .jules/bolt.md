## 2024-06-15 - Fast Sanitization Regex Checking
**Learning:** For high-frequency string matching within recursive object structures, replacing `Array.some(keyword => target.includes(keyword))` with a pre-compiled, non-global regular expression (`RegExp.test()`) can improve performance by ~30% for large data sets by reducing array allocation and iteration overhead.
**Action:** Always consider pre-compiled Regular Expressions instead of mapping over arrays and invoking `.some` + `.includes()` when inspecting large recursive data structures.
