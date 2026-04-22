## 2024-05-15 - Concurrent teardown pattern
**Learning:** Browser and context teardown currently close pages sequentially (`for...of` loop with `await page.close().catch(() => {})`). This is slow if there are many pages. We can parallelize this using `Promise.all` to speed up cleanup operations.
**Action:** Replace `for (const page of this.pages) { await page.close().catch(...) }` with `await Promise.all(this.pages.map(page => page.close().catch(...)))` in `browser.ts`.
