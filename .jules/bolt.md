## 2025-05-07 - [Optimization: RegExp over Array.some for Sanitization]
**Learning:** For high-frequency string matching like sanitizing fast-firing socket payloads, using a pre-compiled Regular Expression (`RegExp.test()`) avoids object allocation and redundant array traversal, making it significantly faster (~5x) than `Array.some(str.includes)`.
**Action:** Always prefer pre-compiled Regex for static list matching against frequent payloads to maintain high event loop responsiveness.
