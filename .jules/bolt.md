## 2024-05-24 - Pre-compiled Regex is Faster than Array.some for Sanitization
**Learning:** For high-frequency string matching (e.g., sanitization of fast-firing socket payloads), `RegExp.test` with a pre-compiled regex is preferred over `Array.some(str.includes)` as it avoids object allocation, redundant traversal, and is significantly faster in Node.js (~3-4x faster).
**Action:** When filtering or redacting payloads in critical paths like BiDi messaging, use pre-compiled regular expressions instead of iterating over arrays with `includes`.
