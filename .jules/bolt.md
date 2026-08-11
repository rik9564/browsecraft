## 2026-04-25 - Pre-compile regex for sanitize

**Learning:** For high-frequency string matching (e.g., sanitization of fast-firing socket payloads), `RegExp.test` with a pre-compiled regex is preferred over `Array.some(str.includes)` as it avoids object allocation, redundant traversal, and is significantly faster in Node.js.
**Action:** Use pre-compiled regex for simple list matches in hot paths instead of array iterators.
