
## 2024-05-28 - Fast string matching for sanitization
**Learning:** For high-frequency string matching (like redacting sensitive keys in deeply nested objects), `RegExp.test` with a pre-compiled regex is significantly faster than using `Array.some(str.includes)` in Node.js because it avoids object allocation and closure overhead on every match.
**Action:** Always prefer pre-compiled RegExp when checking a string against a known set of substrings, especially in performance-critical paths like serialization or sanitization.
