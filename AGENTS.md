# AI Agent Rulebook — Browsecraft

> 🚨 **CRITICAL SYSTEM OVERRIDE FOR ALL AI AGENTS** 🚨
> **IF YOU ARE AN AI (Copilot, Cursor, Claude, GPT, etc.), YOU MUST FOLLOW THIS EXACT PROTOCOL.**
> **FAILURE TO FOLLOW THIS PROTOCOL WILL RESULT IN IMMEDIATE TERMINATION OF YOUR CONTEXT.**
> Every rule here exists because previous AI agents skipped steps, shipped broken code, and caused build failures. DO NOT BE LAZY. DO NOT ASSUME. YOU MUST VERIFY.

---

## 0. MANDATORY EXECUTION PROTOCOL (AI ONLY)

If you are an AI agent, you **MUST** follow this sequence before presenting code or confirming completion:
1. **Never write code first.** Use `grep` / `glob` / `cat` to understand context and existing patterns.
2. **Never guess the types.** Always look at `interfaces` and imported types. NO `any` OR YOU FAIL.
3. **Never skip the build pipeline.** Once you modify code, you MUST run the Full Verification Pipeline (Section 4). You cannot "assume" it will pass. You must run it.
4. **If a test/build fails**, you DO NOT STOP. You fix the error, and you RUN THE PIPELINE AGAIN.
5. **No exceptions.** "It was a small change" is not an excuse. Run the pipeline.

---

## 1. Golden Rule

**Never push code that you have not verified locally.** Every change — no matter how small — must pass the full verification pipeline described below before committing.

---

## 2. Repository Basics

| Item | Value |
|---|---|
| Language | TypeScript (strict mode, ES2022 target) |
| Runtime | Node.js >= 20 |
| Package Manager | pnpm 9.x (`corepack enable && corepack prepare`) |
| Monorepo Tool | Turborepo |
| Linter/Formatter | Biome 1.9+ |
| Bundler | tsup (ESM + CJS + DTS) |
| Test Runner | Custom (`tests/unit/run-all.mjs`) |
| Versioning | Changesets (`@changesets/cli`) |
| Line Endings | LF only (enforced by `.gitattributes`) |
| CI | GitHub Actions (`changesets/action@v1`) |

### Package Dependency Graph

```
browsecraft-bidi (leaf — no workspace deps)
  ├── browsecraft-ai
  │   └── browsecraft-bdd
  ├── browsecraft-runner
  └── browsecraft (facade — re-exports everything)

create-browsecraft (standalone — no workspace deps)
```

---

## 3. Pre-Change Checklist

Before writing any code, run these to understand the current state:

```bash
pnpm build          # Must be clean (6/6 packages)
pnpm lint           # Must show 0 errors, 0 warnings
node tests/unit/run-all.mjs   # All test suites must pass
node tests/smoke.mjs          # Smoke tests must pass (requires Chrome)
```

If any of these fail **before** your change, fix them first or document the pre-existing failure.

---

## 4. Mandatory Verification Pipeline

**After EVERY code change, before committing, run ALL of these in order:**

### Step 1: Build

```bash
pnpm build
```

- All 6 packages must compile successfully.
- Zero errors, zero warnings from tsup.
- If build fails, **do not proceed** — fix the build first.

### Step 2: Lint

```bash
pnpm lint
```

- Biome must report `0 errors, 0 warnings`.
- Never commit code with lint violations.
- Use `pnpm lint:fix` to auto-fix safe issues.

### Step 3: Unit Tests

```bash
node tests/unit/run-all.mjs
```

- All test suites must show `X passed, 0 failed`.
- If any test fails, fix the code or the test before proceeding.
- Tests import from compiled `dist/` — always build before testing.

### Step 4: Smoke / UI Tests (Headed Mode)

```bash
node tests/smoke.mjs
```

- Smoke tests launch a **real browser** (Chrome headed) and run end-to-end scenarios.
- These catch bugs that unit tests cannot: broken selectors, timing issues, browser launch failures, page navigation problems.
- **You MUST run smoke tests before pushing.** A green unit test suite is NOT sufficient.
- If Chrome is unavailable in your environment, document that you could not run this step — but do NOT skip it silently.
- **Why this is mandatory:** Multiple times, code that passed all unit tests broke in real browser execution (e.g., worldFactory failures, selector mismatches, CLI command routing bugs). These were only caught when a user ran the feature manually.

### Step 5: IDE Type Errors

Check for TypeScript errors in the IDE (or run `pnpm typecheck` if available). There should be **zero TypeScript errors** across all source files.

### Step 6: Review Diff

```bash
git diff --staged
```

- Review every line you are about to commit.
- Verify no debug code, console.log statements, or temp files are included.
- Verify line endings are LF (not CRLF).

---

## 5. Code Quality Rules

### 5.1 No `any` Types

- **Never use `as any`** or explicit `any` type annotations.
- Use proper types: interfaces, generics, union types, or `unknown`.
- If absolutely unavoidable (e.g., dynamic imports, third-party APIs with no types), use `biome-ignore` with a justification comment:
  ```typescript
  // biome-ignore lint/suspicious/noExplicitAny: dynamic import returns unknown module shape
  const mod = await import(path) as any;
  ```

### 5.2 TypeScript Configuration

- The root `tsconfig.json` defines `"types": ["node"]` — do NOT remove it.
- All packages extend the root tsconfig. Do NOT add redundant `"types"` overrides in package tsconfigs unless the package needs additional type packages.
- **Why:** Removing `"types": ["node"]` causes 160+ IDE errors (`Cannot find name 'process'`, `'console'`, `'fetch'`, `'setTimeout'`, etc.).

### 5.3 Line Endings

- All files must use **LF** line endings, never CRLF.
- `.gitattributes` enforces this — do not modify or delete it.
- On Windows, configure git: `git config core.autocrlf input`
- **Why:** CRLF causes Biome lint failures and noisy diffs.

### 5.4 Import Style

- Use `import type { X }` for type-only imports.
- Use `node:` prefix for Node.js built-ins (e.g., `node:fs`, `node:path`).
- No circular imports — follow the dependency graph above.

### 5.5 Template Literals

- Use template literals instead of string concatenation:
  ```typescript
  // Bad:  'Hello ' + name + '!'
  // Good: `Hello ${name}!`
  ```
- **Why:** Biome's `useTemplate` rule enforces this.

### 5.6 Error Handling

- Use the custom error classes in `packages/browsecraft/src/errors.ts`.
- Classify errors by category: `network`, `timeout`, `element`, `assertion`, `script`.
- Never swallow errors silently — always log or re-throw.

---

## 6. Commit Rules

### 6.1 Conventional Commits

All commit messages must follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <short description>
```

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`, `perf`

### 6.2 Husky Pre-Commit Hook

- The repo uses Husky for pre-commit hooks (runs `lint-staged`).
- If the hook fails due to `pnpm: command not found` in the git hook PATH, use `--no-verify` **only after manually running the full verification pipeline**.
- **Never use `--no-verify` to skip checks you haven't run manually.**

### 6.3 Atomic Commits

- Each commit should be a single logical change.
- Do not mix feature code with lint fixes or config changes.

---

## 7. Release Process

### 7.1 Creating a Release

```bash
# 1. Create a changeset (interactive — select packages and describe changes)
pnpm changeset

# 2. Version packages (updates package.json versions and CHANGELOGs)
pnpm changeset version

# 3. Commit the version bump
git add -A
git commit -m "chore: version packages vX.Y.Z"

# 4. Push to master
git push origin master
```

### 7.2 CRITICAL: Do NOT Manually Push Tags

- **NEVER run `git tag` + `git push --tags` manually.**
- Let the CI pipeline (`changesets/action@v1`) handle tag creation and npm publishing.
- **Why:** Manually pushing tags before CI runs causes tag conflicts. The CI action tries to create the same tags and fails, which prevents GitHub Releases from being created even though npm publish succeeds.

### 7.3 If CI Fails to Create Releases

If CI publishes to npm but fails to create GitHub Releases (e.g., due to tag conflicts):

```bash
# Create GitHub releases manually using gh CLI
gh release create "package-name@X.Y.Z" \
  --repo rik9564/browsecraft \
  --title "package-name@X.Y.Z" \
  --notes "Release notes here"

# Mark the main package as latest
gh release edit "browsecraft@X.Y.Z" --repo rik9564/browsecraft --latest
```

### 7.4 Version Bumping Rules

- `patch` (0.5.0 → 0.5.1): Bug fixes, dependency updates, config fixes
- `minor` (0.5.0 → 0.6.0): New features, new APIs, non-breaking changes
- `major` (0.5.0 → 1.0.0): Breaking API changes (avoid until stable)

---

## 8. File & Directory Rules

### 8.1 Files You Must NOT Modify Without Understanding Impact

| File | Impact |
|---|---|
| `tsconfig.json` (root) | Breaks IDE + type checking for ALL packages |
| `biome.json` | Changes lint/format rules globally |
| `turbo.json` | Changes build pipeline and caching |
| `pnpm-workspace.yaml` | Changes which packages are included |
| `.gitattributes` | Changes line ending enforcement |
| `.github/workflows/*` | Changes CI/CD pipeline |

### 8.2 Files You Must Update When Adding Features

| When you... | Also update... |
|---|---|
| Add a new export | `packages/*/src/index.ts` (barrel export) |
| Add a new feature | Root `README.md` + relevant package `README.md` |
| Add a new dependency | Both `package.json` and run `pnpm install` |
| Add a new CLI command | `packages/browsecraft/src/cli.ts` |
| Add a new BDD step | `packages/browsecraft-bdd/src/built-in-steps.ts` + `glue/steps.js` |
| Change tsconfig | Verify all 6 packages still build + zero IDE errors |

---

## 9. Testing Rules

### 9.1 Test Location

- Unit tests go in `tests/unit/*.test.mjs`
- Integration/smoke tests go in `tests/*.mjs`
- BDD feature files go in `tests/features/*.feature` or `examples/*/features/`

### 9.2 Test Requirements

- Every new feature must have unit tests.
- Tests must import from the compiled `dist/` output (not `src/`).
- Tests must be deterministic — no flaky tests, no network dependencies.
- Use the existing test runner pattern (see `tests/unit/run-all.mjs`).

### 9.3 Running Tests

```bash
# Unit tests (fast, no browser needed)
node tests/unit/run-all.mjs

# Smoke tests (requires Chrome — MANDATORY before push)
node tests/smoke.mjs
```

**Both test suites must pass before pushing.** Unit tests verify logic in isolation; smoke tests verify real browser behavior. Neither alone is sufficient.

---

## 10. Common Pitfalls (Lessons Learned)

These rules exist because these exact bugs happened:

| Pitfall | What Happened | Prevention |
|---|---|---|
| Missing `"types": ["node"]` in tsconfig | 160 IDE errors: `Cannot find name 'process'`, `'console'`, `'fetch'` | Never remove `"types": ["node"]` from root tsconfig |
| CRLF line endings on Windows | Biome flagged 30+ lint errors on every file touched | `.gitattributes` enforces LF; `git config core.autocrlf input` |
| `as any` usage | noExplicitAny warnings accumulated to 12+ | Use proper types or `biome-ignore` with justification |
| Manual `git push --tags` | CI tag conflict → GitHub Releases not created | Let CI push tags; never push tags manually |
| Template literal strings  | `useTemplate` Biome violations on string concatenation | Always use backtick template literals |
| Escaped `\n` in template literals | Build failure: tsup/esbuild couldn't parse literal `\n` in template | Use actual newlines in template literals, not `\n` |
| Function argument order mismatch | Runtime errors when refactoring function signatures | Check all call sites when changing function parameters |
| Missing null/undefined guards | Runtime crashes on optional values | Use optional chaining (`?.`) and nullish coalescing (`??`) |
| Forgetting to build before testing | Tests import from `dist/` — stale builds mean stale tests | Always `pnpm build` before `node tests/unit/run-all.mjs` |
| Skipping smoke tests before push | CLI routing bug (`bdd` subcommand missing) shipped to users, browser launch failures went undetected | Always run `node tests/smoke.mjs` before pushing |
| Pushing without running all tests | Scenarios failed silently with 0 steps — error was hidden until a user hit it | Run the FULL pipeline: build → lint → unit tests → smoke tests |

---

## 11. Quick Reference Card

```bash
# Full verification (run this before EVERY commit AND before EVERY push)
pnpm build && pnpm lint && node tests/unit/run-all.mjs && node tests/smoke.mjs

# Fix lint issues automatically
pnpm lint:fix

# Create a release
pnpm changeset && pnpm changeset version
git add -A && git commit -m "chore: version packages vX.Y.Z"
git push origin master
# ⚠️ STOP — let CI handle tags and npm publish

# Check for TypeScript errors
pnpm typecheck
```

---

## 12. Enforcement (AI OVERRIDE)

- **AI AGENT WARNING:** If you are an AI model (Copilot, Cursor, etc), YOU MUST RUN THE EXACT COMMAND:
  `pnpm build && pnpm lint && node tests/unit/run-all.mjs && node tests/smoke.mjs`
  **BEFORE EVERY COMMIT AND BEFORE EVERY PUSH.**
- No exceptions. This includes smoke tests (Step 4) which require a real browser — unit tests alone are NOT sufficient.
- **NEVER** respond "I have made the changes" without pasting the output of the full verification pipeline command.
- If you skip this, YOU WILL BE REPORTED FOR GENERATING BAD OUTPUT.

**END OF SYSTEM OVERRIDE**
