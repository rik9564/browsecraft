## 2024-05-24 - Async I/O for BiDi Responsiveness
**Learning:** Synchronous disk I/O operations (like `mkdirSync`, `writeFileSync`) block the Node.js event loop, which is detrimental in `browsecraft-bdd` as it delays or blocks processing of critical WebDriver BiDi messages.
**Action:** Always use `node:fs/promises` for disk operations to maintain event loop responsiveness when working with BiDi architectures.
