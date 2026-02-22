# Contributing to Browsecraft

Thank you for your interest in contributing to Browsecraft! This guide will help you get started.

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) >= 20.0.0
- [pnpm](https://pnpm.io/) 9.x (managed via `packageManager` field)
- Google Chrome (for running tests)

### Getting Started

```bash
# Clone the repository
git clone https://github.com/rik9564/browsecraft.git
cd browsecraft

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run linting
pnpm lint

# Run type checking
pnpm typecheck

# Run smoke tests
node tests/smoke.mjs
```

## Project Structure

This is a monorepo managed with [Turborepo](https://turbo.build/) and [pnpm workspaces](https://pnpm.io/workspaces).

```
packages/
  browsecraft/          # Main facade package (Browser, Page, expect, etc.)
  browsecraft-bidi/     # WebDriver BiDi protocol client (leaf package)
  browsecraft-ai/       # AI-powered features (GitHub Models API)
  browsecraft-bdd/      # Built-in BDD/Gherkin support
  browsecraft-runner/   # Test runner
examples/               # Example projects
tests/                  # Integration tests (smoke, BDD)
```

### Package Dependency Graph

```
browsecraft-bidi (leaf)
  ├── browsecraft-ai
  │   └── browsecraft-bdd
  ├── browsecraft-runner
  └── browsecraft (facade)
```

## Development Workflow

### Making Changes

1. Create a feature branch from `master`:
   ```bash
   git checkout -b feat/my-feature
   ```

2. Make your changes in the relevant package(s).

3. Run the full check suite before committing:
   ```bash
   pnpm lint        # Biome linting + formatting
   pnpm build       # Build all packages
   pnpm typecheck   # TypeScript type checking
   node tests/smoke.mjs  # Smoke tests
   ```

4. Commit using the [conventional commit](#commit-convention) format.

5. Push and open a pull request against `master`.

### Linting & Formatting

We use [Biome](https://biomejs.dev/) for linting and formatting. Configuration is in `biome.json` at the project root.

```bash
pnpm lint          # Check for issues
pnpm lint:fix      # Auto-fix safe issues
pnpm format        # Format all files
```

**Style rules:**
- Indentation: tabs
- Line width: 100 characters
- Quotes: single quotes
- Semicolons: always
- Trailing commas: all

### Building

```bash
pnpm build                     # Build all packages (via Turborepo)
pnpm turbo run build --force   # Force rebuild without cache
```

Each package uses [tsup](https://tsup.egoist.dev/) (esbuild-powered) for bundling, producing both ESM and CJS outputs.

### Testing

```bash
node tests/smoke.mjs           # 41 smoke tests (requires Chrome)
node tests/bdd-saucelabs.mjs   # BDD tests against saucedemo.com
```

Tests import from compiled `dist/` output to verify what users will actually receive.

## Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <short description>
```

### Types

| Type | Description |
|------|-------------|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation only changes |
| `chore` | Maintenance tasks (deps, config, etc.) |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test` | Adding or updating tests |
| `ci` | CI/CD configuration changes |
| `perf` | Performance improvements |

### Examples

```
feat: add drag-and-drop support to Page API
fix: resolve click reliability in headed mode
docs: add BDD examples to README
ci: add smoke tests to CI pipeline
chore: bump all packages to v0.1.3
```

## Pull Requests

- PRs should target the `master` branch.
- Ensure CI passes (lint, typecheck, build, tests).
- Keep PRs focused — one feature or fix per PR.
- Include a clear description of what changed and why.

## Reporting Issues

- Use the [bug report template](https://github.com/rik9564/browsecraft/issues/new?template=bug_report.yml) for bugs.
- Use the [feature request template](https://github.com/rik9564/browsecraft/issues/new?template=feature_request.yml) for ideas.
- Check existing issues before creating a new one.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
