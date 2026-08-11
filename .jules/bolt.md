
## 2024-05-21 - [Fast-firing string matching optimization]
**Learning:** In fast-firing data streams (like BiDi sanitization payloads), `Array.some(str.includes)` incurs significant overhead in Node.js because it allocates functions and traverses arrays redundantly. A pre-compiled `RegExp` avoids object allocation and is approximately 4-5x faster.
**Action:** When performing high-frequency string matching checks, especially for key redaction or sanitization, use a pre-compiled `RegExp` (`/pattern/i.test(string)`) rather than an array of substrings checked inside loops or `.some()`.
