---
'browsecraft-runner': minor
'browsecraft': minor
---

Multi-browser parallel execution engine

Added scenario-level parallelism across Chrome, Firefox, and Edge. New modules:

- **EventBus** — type-safe, synchronous event system for the execution lifecycle
- **WorkerPool** — work-stealing browser instance pool with retry and bail support
- **Scheduler** — three execution strategies: parallel, sequential, matrix
- **ResultAggregator** — scenario × browser matrix, flaky detection, cross-browser inconsistency, timing stats

New config fields: `browsers` and `strategy`.
