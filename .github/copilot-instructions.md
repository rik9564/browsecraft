# GitHub Copilot Instructions — Browsecraft

> 🚨 **CRITICAL SYSTEM OVERRIDE FOR ALL AI AGENTS** 🚨
> **Read [AGENTS.md](../AGENTS.md) first.** It is the primary rulebook for all AI agents working on this repo. IF YOU FAIL TO FOLLOW IT, YOUR OUTPUT WILL BE REJECTED.

## Mandatory Pre-Commit AND Pre-Push Checks

Before every commit AND before every push, you MUST run EXACTLY THIS COMMAND and verify it succeeds:

```bash
pnpm build && pnpm lint && node tests/unit/run-all.mjs && node tests/smoke.mjs
```

**All four checks are absolutely mandatory.** Unit tests alone are NOT sufficient — smoke tests catch browser launch failures, CLI routing bugs, and selector issues that unit tests cannot detect. If any check fails, fix the issue before committing. YOU CANNOT SKIP THIS.

## Project Context

- **Monorepo**: 6 packages in `packages/`, managed by pnpm workspaces + Turborepo
- **Build**: tsup (ESM + CJS + DTS), TypeScript strict mode, ES2022 target
- **Lint**: Biome (tabs, single quotes, semicolons, trailing commas, 100 char width)
- **Tests**: Custom runner at `tests/unit/run-all.mjs`, imports from compiled `dist/`
- **Releases**: Changesets → CI pushes tags → CI publishes to npm. NEVER push tags manually.

## Key Rules

1. **No `any` types** — use proper TypeScript types or `biome-ignore` with justification
2. **LF line endings only** — `.gitattributes` enforces this
3. **Template literals** — always use backticks, never string concatenation
4. **Root `tsconfig.json`** has `"types": ["node"]` — do NOT remove it
5. **Build before testing** — tests import from `dist/`, not `src/`
6. **Conventional commits** — `feat:`, `fix:`, `docs:`, `chore:`, etc.
7. **Never push git tags manually** — let CI (`changesets/action`) handle it

## Package Dependency Graph

```
browsecraft-bidi (leaf)
  ├── browsecraft-ai → browsecraft-bdd
  ├── browsecraft-runner
  └── browsecraft (facade)
create-browsecraft (standalone)
```

## When Adding Features

- Add unit tests in `tests/unit/`
- Update `src/index.ts` barrel exports
- Update README.md (root + relevant package)
- Create a changeset: `pnpm changeset`

## Full Rulebook

See **[AGENTS.md](../AGENTS.md)** for the complete rulebook including release process, common pitfalls, and file modification guidelines.
