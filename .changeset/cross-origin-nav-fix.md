---
"browsecraft": patch
"browsecraft-bdd": patch
---

Fix cross-origin click navigation causing "Cannot find context with specified id" errors. `page.url()`, `page.title()`, and `page.content()` now retry on transient context errors during cross-origin navigation. BDD URL and title assertion steps now poll until the navigation completes.
