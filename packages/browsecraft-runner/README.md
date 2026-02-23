# browsecraft-runner

Test runner, parallel scheduler, and multi-browser worker pool for [Browsecraft](https://github.com/rik9564/browsecraft).

Provides an event-driven architecture for distributing test scenarios across browser instances with work-stealing scheduling, failure classification, smart retry, and rich result aggregation.

Most users should install [`browsecraft`](https://www.npmjs.com/package/browsecraft) instead — it includes the runner automatically.

## Install

```bash
npm install browsecraft-runner
```

## Core Components

### EventBus

Decouples execution from reporting. Subscribe to lifecycle events:

```js
import { EventBus } from 'browsecraft-runner';

const bus = new EventBus();

bus.on('item:pass', ({ item, worker, duration }) => {
  console.log(`✓ ${item.title} on ${worker.browser} (${duration}ms)`);
});

bus.on('item:fail', ({ item, error }) => {
  console.log(`✗ ${item.title}: ${error.message}`);
});
```

Events: `run:start/end`, `worker:spawn/ready/busy/idle/error/terminate`, `item:enqueue/start/pass/fail/skip/retry/end`, `browser:start/end`, `progress`.

### WorkerPool

Manages browser instances across multiple browsers:

```js
import { WorkerPool } from 'browsecraft-runner';

const pool = new WorkerPool(bus, {
  browsers: { chrome: 2, firefox: 1, edge: 1 },
  maxRetries: 1,
  bail: false,
});

await pool.spawn(async (worker) => {
  const session = await launchBrowser(worker.browser);
  return { close: () => session.close() };
});
```

### Scheduler

Three execution strategies:

| Strategy | How it works |
|----------|-------------|
| `parallel` | Distribute scenarios across all browsers simultaneously |
| `sequential` | One browser at a time |
| `matrix` | Every scenario × every browser |

```js
import { Scheduler } from 'browsecraft-runner';

const scheduler = new Scheduler(bus, pool, { strategy: 'matrix' });
const result = await scheduler.run(scenarios, executor);
```

### ResultAggregator

Produces scenario × browser matrices with analytics:

```js
import { ResultAggregator } from 'browsecraft-runner';

const aggregator = new ResultAggregator();
const summary = aggregator.aggregate(result);

console.log(aggregator.formatMatrix(summary));
console.log(aggregator.formatSummary(summary));
```

Includes flaky test detection, cross-browser inconsistency analysis, and timing statistics (min, max, avg, median, p95).

### Failure Classification & Smart Retry

```js
import { classifyFailure } from 'browsecraft-runner';

const classification = classifyFailure(error);
// { category: 'network', retryable: true, name: 'ECONNRESET' }
```

| Category | Retryable | Examples |
|----------|-----------|----------|
| `network` | Yes | `ECONNRESET`, `ECONNREFUSED`, socket timeouts |
| `timeout` | Yes | Navigation timeouts, page load timeouts |
| `element` | Conditional | Not found (retryable), disabled (not retryable) |
| `assertion` | No | `Expected "foo" but got "bar"` |
| `script` | No | `TypeError`, `ReferenceError` |

### TestRunner

Simple test file runner with grep, bail, and retry support:

```js
import { TestRunner } from 'browsecraft-runner';

const runner = new TestRunner({
  config: { browser: 'chrome', headless: true, timeout: 30000 },
  grep: 'login',
  bail: false,
});

const exitCode = await runner.run(loadFile, executeTest);
```

## License

[MIT](LICENSE)
