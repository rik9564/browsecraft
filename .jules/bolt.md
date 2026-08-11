## 2025-05-08 - Use pre-compiled Regex instead of Array.some for high-frequency string checks
**Learning:** Using `Array.some` coupled with `.includes` inside a fast loop or high-frequency utility like `sanitize` is significantly slower (by ~3x-4x in Node.js) because it allocates an array, an iterator, and closure scopes for each match, compared to a single pre-compiled `/regex/i.test(key)` check.
**Action:** Prioritize `RegExp.test` for fixed-set substring checks instead of iterating over string arrays when performance is critical.
