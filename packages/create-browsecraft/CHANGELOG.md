# create-browsecraft

## 0.4.0

### Minor Changes

- [`049d757`](https://github.com/rik9564/browsecraft/commit/049d7578e0ba05f90f0fd0c16b3d5a44653fd7a9) Thanks [@rik9564](https://github.com/rik9564)! - Add BDD CLI mode (`browsecraft test --bdd`), fix double browser window in headed mode, fix thenable module bug

  ### New Features

  - **BDD CLI mode**: `browsecraft test --bdd` discovers `.feature` files, loads step definitions, registers built-in steps, launches browser, and runs scenarios with full BDD-style output
  - **BddConfig**: New `bdd` configuration option in `browsecraft.config.ts` for specifying feature/step file paths and enabling built-in steps

  ### Bug Fixes

  - **Double browser window**: Headed mode no longer opens two browser windows. The initial `about:blank` tab is reused by `newPage()` instead of creating a second tab
  - **Thenable module bug**: Renamed `then` export to `thenStep` in `browsecraft-bdd` and `browsecraft` to prevent Node.js from treating ES modules as thenables during dynamic import
  - **create-browsecraft**: Fixed scaffolded feature template step patterns to match built-in step definitions

## 0.3.0

### Minor Changes

- [`27384e8`](https://github.com/rik9564/browsecraft/commit/27384e87ff88f668fff7d7648000a396c408e6d2) Thanks [@rik9564](https://github.com/rik9564)! - Add create-browsecraft scaffolding CLI and update documentation

  - New `create-browsecraft` package: `npm init browsecraft` scaffolds a complete project with zero config
  - Supports `--bdd`, `--js`, `--quiet` flags and target directory
  - README: added network interception, actionability, error types, built-in BDD steps, page.go/page.see docs
  - Architecture updated from 5 to 6 packages
  - CONTRIBUTING: added create-browsecraft to project structure, updated test count to 102
