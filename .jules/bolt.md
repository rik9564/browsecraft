
## 2024-05-14 - Precompiled RegExp over Array.some() for high-frequency string matching
**Learning:** Using \`Array.some(str.includes)\` for high-frequency string matching (like sanitizing socket payloads) causes unnecessary object allocation, redundant traversal, and is significantly slower in Node.js compared to a precompiled regex.
**Action:** Always prefer \`RegExp.test\` with a precompiled regex for high-frequency string redaction or sanitization paths to avoid object allocation and improve execution speed.
