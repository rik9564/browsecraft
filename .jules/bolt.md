
## 2025-03-14 - Replace Array.some(includes) with RegExp in sanitize for performance
**Learning:** For high-frequency string matching (e.g., sanitization of fast-firing socket payloads in BiDi), `RegExp.test` with a pre-compiled case-insensitive regex is significantly faster than `Array.some(k => str.includes(k))` as it avoids redundant object allocation (`toLowerCase()`) and repeated array traversal.
**Action:** Next time I need to check if a string contains one of several predefined keywords in a hot loop, I will use a single pre-compiled regex rather than `Array.some` combined with string includes/indexOf.
