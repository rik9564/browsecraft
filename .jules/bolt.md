
## 2024-05-24 - High-Frequency Sanitization: RegExp.test vs Array.some
**Learning:** In high-frequency payload loops (e.g., sanitizing WebSocket/BiDi communication loops where debug mode logs all payloads), using `Array.some(k => string.includes(k))` results in excessive object allocation and string manipulation. A pre-compiled Regex (`/(?:...)/i.test(string)`) performs this operation significantly faster (~5x) in Node.js, avoiding the overhead of lowercasing each key and iterating through arrays.
**Action:** Always prefer pre-compiled Regular Expressions for substring matching against multiple keywords in hot paths or high-frequency operations.
