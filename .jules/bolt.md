
## 2024-03-12 - Fast string matching over object traversal
**Learning:** For high-frequency string matching (like sanitizing fast-firing BiDi socket payloads), `Array.some(str.includes)` performs poorly due to closure allocation per-call and repeated array traversals. A pre-compiled regular expression with case-insensitivity (`/i`) can handle this much faster, avoiding N+1 closures and string lookups.
**Action:** When scanning objects or fast-moving streams for specific substring keys, prefer a single pre-compiled `RegExp.test()` over iterative `Array.some()`.
