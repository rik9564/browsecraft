## 2025-03-04 - [Regex over Array.some for Sanitization]
**Learning:** For high-frequency string matching (e.g., sanitization), `RegExp.test` is preferred over `Array.some(str.includes)` as it avoids object allocation and is significantly faster in Node.js.
**Action:** When performing string inclusion checks against a predefined set of static keywords, use a pre-compiled regular expression instead of an array `some` scan with `includes`.
