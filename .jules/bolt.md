
## 2025-05-17 - RegExp testing is 5x faster than Array.some for key matching
**Learning:** For high-frequency string matching (e.g., sanitization of fast-firing socket payloads), `RegExp.test` with a pre-compiled regex is preferred over `Array.some(str.includes)` as it avoids object allocation, redundant traversal, and is significantly faster in Node.js (approx 5x faster).
**Action:** Always prefer precompiled regex for sensitive key matching instead of iterating over arrays.
