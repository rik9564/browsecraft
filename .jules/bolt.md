
## 2024-05-24 - Pre-compiled Regex for High-Frequency Sanitization
**Learning:** For high-frequency string matching on fast-firing socket payloads, using `RegExp.test` with a pre-compiled regex avoids redundant array traversal and object allocation compared to `Array.some(str.includes)`.
**Action:** Always prefer pre-compiled regexes for hot-path string filtering, especially in sanitization routines where every millisecond counts.
