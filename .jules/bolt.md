## 2024-05-03 - Event Loop Blocking via Sync I/O in BiDi Architecture
**Learning:** In the Browsecraft architecture, synchronous disk I/O operations (like `writeFileSync` in caching layers) block the Node.js event loop, which is highly problematic because it delays the processing of incoming, high-frequency WebSocket/WebDriver BiDi messages, leading to unresponsiveness.
**Action:** Always use `node:fs/promises` (`mkdir`, `writeFile`, etc.) for disk operations to ensure the event loop remains free to handle asynchronous browser automation messages.
