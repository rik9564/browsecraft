---
"browsecraft-bidi": minor
"browsecraft": patch
"browsecraft-bdd": patch
"browsecraft-runner": patch
"browsecraft-ai": patch
"create-browsecraft": patch
---

Drop the `ws` dependency in favor of Node's built-in, spec-compliant `WebSocket` global (stable since Node 22). This removes the last non-essential external runtime dependency from the BiDi transport layer. Requires Node.js >= 22.
