## 2024-05-18 - [Optimization of Array.some(includes) to RegExp]
**Learning:** For high-frequency string matching (e.g., sanitization), `RegExp.test` is preferred over `Array.some(str.includes)` as it avoids object allocation and is ~3x faster in Node.js.
**Action:** Use pre-compiled Regex for multiple string match checks.
