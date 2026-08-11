## 2024-05-05 - RegExp vs Array.some for String Matching
**Learning:** For high-frequency string matching (e.g., sanitization of fast-firing socket payloads), `RegExp.test` with a pre-compiled regex is preferred over `Array.some(str.includes)` as it avoids object allocation, redundant traversal, and is significantly faster in Node.js.
**Action:** Prioritize pre-compiled Regex for frequent text-matching loops over array methods in hot paths like WebDriver BiDi messaging.
