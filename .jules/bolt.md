## 2024-05-27 - Refactor sync I/O to async in Browsecraft-BDD disk cache
**Learning:** Found synchronous disk operations (`readFileSync`, `mkdirSync`, `writeFileSync`) in `loadDiskCache` and `saveDiskCache` in `ai-step-executor.ts`. As memory specifies, disk I/O operations must use `node:fs/promises` to prevent blocking the event loop, critical for maintaining responsiveness to WebDriver BiDi messages.
**Action:** Replace synchronous `fs` methods with their asynchronous counterparts from `node:fs/promises` for all caching operations in `ai-step-executor.ts`.
