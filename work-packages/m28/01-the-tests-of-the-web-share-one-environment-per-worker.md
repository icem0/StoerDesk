# WP-M28-01: the tests of the web share one environment per worker

format: ctx-256k
status: planned
depends-on: —
phase: 28
milestone: m28
context-budget: 40k tokens
spec: PLAN.md §18.1 (the gates of the check)
spec-lines: 20
changed-lines: 60

files-read:

- apps/web/vitest.config.ts (the configuration of the web project)
- apps/web/src/features/tickets/__tests__/ticket-detail-page.test.tsx (a test of a page with the i18n provider)

files-write:

- apps/web/vitest.config.ts
- work-packages/m28/

interfaces:

- `pool: 'vmThreads'` — the pool of the web project: one VM thread per worker, one jsdom environment per worker, one module registry per test file

## Task

The gate of the repository runs the tests of the web in 36 s of the 139 s of
the whole suite, and the web project is the smallest of the three. The reason
is the pool: with the default `isolate: true` every one of the 88 test files
built its own jsdom environment and evaluated the whole module graph of the app
again — 288 modules were evaluated 2399 times, the 88 environments cost 111 s
of the tracked time.

1. **The pool** `apps/web/vitest.config.ts`: `pool: 'vmThreads'` runs the tests
   of the web in a VM thread instead of a child process. Every test file keeps
   its own module registry and its own mocks, so the isolation of the files
   stays; the jsdom environment and the transformed modules are shared inside a
   worker.
2. **The measurement**: the web project needs 13 s instead of 36 s, the 540
   cases stay green. `isolate: false` would be faster still, but the files
   would share the globals of the window with each other — 227 cases failed, so
   the VM thread is the boundary.

## Non-goals

- No change of a test, no change of a component and no new text.
- No change of the pool of the API project: it needs the native modules of the
  runtime, and the files of the API rely on the isolation of the module
  registry (the rate limit of the login leaked between the files).
- No change of the shared project — it needs 2 s.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the web project needs less than 20 s and every case of
the web stays green.

## Handoff

- Files changed: the configuration of the web project
- Interfaces added: none
- Verified: the commands above
- Follow-up WP: **WP-M28-02** (the integration tests of the API share one
  migrated template database instead of building one per file)
- Open question: none
