
## 2024-06-10 - Replace Array.some with Regex for high-frequency string matching
**Learning:** For high-frequency string matching operations (like in `sanitize` which runs on every BiDi message), replacing an array of strings checked via `Array.some(keyword => target.includes(keyword))` with a single, pre-compiled, non-global regular expression (`RegExp.test()`) can improve execution speed by ~2x by reducing object allocation and iteration overhead.
**Action:** Identify critical paths that iterate over arrays of keywords for string matching and replace them with a pre-compiled regex when possible.
