## 2024-04-11 - Fast string matching for sanitization
**Learning:** For high-frequency string matching (e.g., sanitization of fast-firing socket payloads), `RegExp.test` with a pre-compiled regex is preferred over `Array.some(str.includes)` as it avoids object allocation, redundant traversal, and is significantly faster in Node.js.
**Action:** Replace array iterations for substring matching with pre-compiled regex in hot paths.
