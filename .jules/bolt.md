
## 2024-03-21 - [Fast-firing socket payloads performance]
**Learning:** For high-frequency string matching (e.g., sanitization of fast-firing socket payloads), `RegExp.test` with a pre-compiled regex avoids object allocation and redundant traversal. It is significantly faster in Node.js compared to `Array.some(str.includes)`.
**Action:** Use pre-compiled Regex `.test()` instead of iterative array methods when validating or matching sensitive keys in high-throughput contexts.
