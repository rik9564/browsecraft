## 2024-05-14 - Optimize array search in hot paths
**Learning:** Using `Array.some(keyword => target.toLowerCase().includes(keyword))` in high-frequency string matching scenarios (like BiDi message sanitization) creates a bottleneck due to repeated object allocations and loop overhead.
**Action:** Replace multiple inclusion checks with a single pre-compiled, non-global Regular Expression (`RegExp.test()`), improving execution speed by ~5-6x in hot paths.
## 2026-06-28 - Smoke tests require headless mode in CI
**Learning:** CI checks that rely on browsers will fail with "Missing X server or $DISPLAY" if tests run with `headless: false`.
**Action:** Dynamically patch tests to use `headless: true` during CI using a sed script injection in the workflow yaml immediately before the test runner instead of committing test file alterations.
