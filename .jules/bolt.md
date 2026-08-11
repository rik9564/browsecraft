## 2024-05-24 - Precompiled RegExp optimization
**Learning:** For high-frequency string matching (like deep object sanitization across many keys), using `RegExp.test` with a pre-compiled regular expression is significantly (~4x) faster than `Array.some((k) => str.includes(k))` in Node.js. It avoids multiple `.includes()` method calls and the allocation of closures/arrays on every iteration.
**Action:** Use pre-compiled RegExes instead of array iterations for simple multi-substring matching in hot paths like network interception logging or object sanitization.
