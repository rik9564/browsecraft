## 2025-02-23 - Non-blocking I/O in Disk Cache
**Learning:** Disk I/O operations (like `saveDiskCache` and `loadDiskCache` in `browsecraft-bdd/src/ai-step-executor.ts`) block the event loop if they use synchronous methods like `readFileSync`, `writeFileSync`, and `mkdirSync`. This blocking can negatively impact the responsiveness to high-frequency WebDriver BiDi messages.
**Action:** Always use asynchronous methods from `node:fs/promises` (`readFile`, `writeFile`, `mkdir`) for disk I/O, especially in components that interact with asynchronous protocols.
