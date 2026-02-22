# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-02-22

### Added
- README documentation for all npm packages (browsecraft, browsecraft-bidi, browsecraft-ai, browsecraft-bdd, browsecraft-runner)
- CI/CD pipeline with GitHub Actions
- npm provenance for supply chain security

### Changed
- Repository URLs updated to rik9564/browsecraft

## [0.1.0] - 2026-02-22

### Added
- Core browser automation API (`Browser.launch()`, `page.goto()`, `page.click()`, `page.fill()`, etc.)
- WebDriver BiDi protocol client (`browsecraft-bidi`)
- Built-in BDD framework (`browsecraft-bdd`):
  - Gherkin parser with full spec support (70+ languages)
  - Step definitions with `{string}`, `{int}`, `{float}`, `{word}` placeholders
  - TypeScript-native BDD mode (`feature()`, `scenario()`, `given()`, `when()`, `then()`)
  - Hooks (Before, After, BeforeAll, AfterAll, BeforeStep, AfterStep)
  - Tag expressions with `and`, `or`, `not`, and parentheses
  - Scenario Outlines with Examples tables
  - AI auto-step generation
- AI features (`browsecraft-ai`):
  - Self-healing selectors
  - Test generation from natural language
  - Visual regression with pixel-by-pixel comparison
  - GitHub Models API integration (free, opt-in)
- Test runner (`browsecraft-runner`) with file discovery, grep filtering, retries, and reporting
- CLI with `--headed`, `--maximized`, and `--slowMo` flags
- Cookie and screenshot APIs
- npm publishing infrastructure (LICENSE, .npmignore, publishConfig for all packages)
- Example projects (getting-started, bdd-gherkin, bdd-typescript)

[0.1.1]: https://github.com/rik9564/browsecraft/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/rik9564/browsecraft/releases/tag/v0.1.0
