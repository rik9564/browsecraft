## 2024-05-18 - RegExp.test vs Array.some for high-frequency checks
**Learning:** For high-frequency string matching (e.g., sanitization of fast-firing socket payloads), `RegExp.test` with a pre-compiled regex is preferred over `Array.some(str.includes)`. It avoids object allocation, redundant traversal, and is significantly faster in Node.js.
**Action:** Use pre-compiled regex for repeated string matching over small fixed lists.
