## 2026-05-16 - Pre-compiled Regex for Sensitive Key Redaction
**Learning:** For high-frequency string matching (like object key sanitization of incoming/outgoing fast socket messages), `RegExp.test` with a pre-compiled regex is much faster than `Array.some` combined with `toLowerCase()` and `includes()`.
**Action:** Replace `SENSITIVE_KEYS.some` with a pre-compiled `SENSITIVE_PATTERN` regex in `sanitize` function.
