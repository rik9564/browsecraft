
## 2024-05-18 - [Optimization: RegExp over Array.some]
**Learning:** For high-frequency string matching (e.g., sanitization of fast-firing socket payloads), `RegExp.test` with a pre-compiled regex avoids object allocation and redundant traversal, and is ~3-4x faster than `Array.some(str.includes)` in Node.js.
**Action:** Use pre-compiled `RegExp` instead of iterating over string arrays for high-frequency substring matching algorithms.
