
## 2025-03-09 - RegExp vs Array.some for fast-firing socket payload sanitization
**Learning:** For high-frequency string matching (e.g., sanitization of fast-firing socket payloads over BiDi), `RegExp.test` with a pre-compiled regex is preferred over `Array.some(str.includes)` as it avoids object allocation, redundant traversal, and is significantly faster in Node.js.
**Action:** Use pre-compiled RegExes instead of arrays and `some` checks for string matching, especially in hot paths like message serialization/deserialization.
