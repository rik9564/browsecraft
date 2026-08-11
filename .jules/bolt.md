## 2024-05-18 - [Optimize Array.some() to Regex for Sensitive Keys]
**Learning:** Pre-compiled regular expressions (`RegExp.test()`) can be significantly faster (up to ~3x) than iterating over an array of strings with `Array.some(str => target.includes(str))` for high-frequency operations, such as redacting sensitive keys in BiDi network events.
**Action:** Use pre-compiled Regex checks instead of `Array.some` loops when sanitizing or filtering string keys in high-throughput data paths, ensuring to avoid the global `g` flag for single-item tests to prevent `lastIndex` state issues.
