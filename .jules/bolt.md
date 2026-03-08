## 2024-05-24 - Pre-compiled Regex for High-Frequency String Matching
**Learning:** For high-frequency string matching (e.g., sanitization of fast-firing socket payloads), `RegExp.test` with a pre-compiled regex is preferred over `Array.some(str.includes)` as it avoids object allocation, redundant traversal, and is significantly faster in Node.js.
**Action:** When sanitizing frequently emitted data payloads (like BiDi/CDP network messages), use pre-compiled regexes instead of iterating arrays of substrings.
