## 2026-05-28 - Pre-compiled Regex for high-frequency string matching
**Learning:** For high-frequency string matching, replacing `Array.some(keyword => target.includes(keyword))` with a single pre-compiled, non-global regular expression (`RegExp.test()`) can improve execution speed by ~3x by reducing object allocation and iteration overhead.
**Action:** Use pre-compiled Regex for matching against multiple string prefixes/keywords instead of iterating with `Array.some` in hot paths like message sanitization or filtering.
