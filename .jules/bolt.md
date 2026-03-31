## 2024-05-24 - [Optimize Object Redaction with Regex]
**Learning:** For high-frequency string matching (e.g., sanitization of fast-firing socket payloads), `RegExp.test` with a pre-compiled regex is preferred over `Array.some(str.includes)` as it avoids object allocation, redundant traversal, and is significantly faster in Node.js.
**Action:** Use pre-compiled regex for string matching in hot paths like object sanitization.
