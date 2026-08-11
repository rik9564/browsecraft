## 2024-05-24 - Socket Payload Sanitization Performance
**Learning:** In WebDriver BiDi, socket payloads fire at high frequencies. Using `Array.some(str.includes)` for sanitizing these payloads introduces significant overhead due to object allocation and redundant array traversals.
**Action:** Always use pre-compiled RegEx (like `/(?:authorization|cookie|password|token|secret|session|auth)/i.test(str)`) for fast string matching in critical high-throughput paths instead of array iteration.
