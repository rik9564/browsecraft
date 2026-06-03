## 2024-05-15 - Fast sanitize with Regex
**Learning:** For high-frequency string matching (like redacting sensitive keys in BiDi logging), `Array.some(keyword => target.includes(keyword))` creates unnecessary iteration and object allocation overhead. Pre-compiled Regex (`RegExp.test()`) without the global `g` flag is ~3x faster.
**Action:** Replace array iteration checks with pre-compiled regex in high-frequency validation/sanitization functions.
