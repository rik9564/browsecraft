## 2024-05-24 - Precompiled RegExp for high-frequency string matching
**Learning:** For high-frequency string matching (e.g., sanitization of fast-firing socket payloads), `RegExp.test` with a pre-compiled regex is preferred over `Array.some(str.includes)` as it avoids object allocation, redundant traversal, and is significantly faster in Node.js.
**Action:** Use precompiled `RegExp` instead of iterating over arrays with `includes` when checking against a fixed set of sensitive keys.
