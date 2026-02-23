---
'browsecraft': minor
'browsecraft-bdd': minor
'browsecraft-bidi': minor
'browsecraft-ai': minor
'browsecraft-runner': minor
'create-browsecraft': minor
---

Add BDD CLI mode (`browsecraft test --bdd`), fix double browser window in headed mode, fix thenable module bug

### New Features
- **BDD CLI mode**: `browsecraft test --bdd` discovers `.feature` files, loads step definitions, registers built-in steps, launches browser, and runs scenarios with full BDD-style output
- **BddConfig**: New `bdd` configuration option in `browsecraft.config.ts` for specifying feature/step file paths and enabling built-in steps

### Bug Fixes
- **Double browser window**: Headed mode no longer opens two browser windows. The initial `about:blank` tab is reused by `newPage()` instead of creating a second tab
- **Thenable module bug**: Renamed `then` export to `thenStep` in `browsecraft-bdd` and `browsecraft` to prevent Node.js from treating ES modules as thenables during dynamic import
- **create-browsecraft**: Fixed scaffolded feature template step patterns to match built-in step definitions
