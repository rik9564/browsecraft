## 2026-05-13 - Avoid synchronous fs operations
**Learning:** Synchronous fs operations like readFileSync block the Node.js event loop, creating performance bottlenecks for fast-firing WebSocket events in WebDriver BiDi environments.
**Action:** Use async methods from node:fs/promises to ensure responsiveness and low latency.
