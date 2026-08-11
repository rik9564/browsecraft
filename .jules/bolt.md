## 2026-05-04 - Optimize disk I/O in browsecraft-bdd cache
**Learning:** Disk I/O operations (e.g., saveDiskCache) must use node:fs/promises (mkdir, writeFile) instead of synchronous counterparts to prevent blocking the event loop, which is critical for maintaining responsiveness to WebDriver BiDi messages.
**Action:** Replaced synchronous I/O functions with asynchronous node:fs/promises equivalents in ai-step-executor.ts.
