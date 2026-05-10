## 2024-05-24 - Async File I/O in browsecraft-bdd
**Learning:** Using synchronous disk I/O (like `readFileSync` or `writeFileSync`) in `browsecraft-bdd` blocks the main thread and event loop, making the application unresponsive to WebDriver BiDi messages.
**Action:** Always prefer `node:fs/promises` (`readFile`, `writeFile`, `mkdir`) for file system operations to ensure the event loop remains unblocked, specifically in WebDriver BiDi environments where maintaining responsiveness is critical.
