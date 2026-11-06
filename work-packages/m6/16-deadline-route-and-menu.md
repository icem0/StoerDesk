# WP-M6-16: deadline route and menu entry

format: small-model
status: done
depends-on: WP-M6-15
phase: 6
milestone: m6
context-budget: 14k tokens
spec: specs/05-timeline.md §5.1; ADR-0008
spec-lines: 30

files-read:

- apps/web/src/routes/index.tsx
- apps/web/src/admin/admin-home-page.tsx
- apps/web/src/admin/__tests__/admin-home-page.test.tsx

files-write:

- apps/web/src/routes/index.tsx
- apps/web/src/admin/admin-home-page.tsx
- apps/web/src/admin/__tests__/admin-home-page.test.tsx

interfaces:

- route `/admin/deadlines` (guarded by `RequireSession`)
- admin home module `deadlines` with `to: '/admin/deadlines'` (available badge)

## Task

1. Register `/admin/deadlines` in `routes/index.tsx` with `DeadlinesPage`.
2. In `admin-home-page.tsx` the `deadlines` module becomes `{ key: 'deadlines', to: '/admin/deadlines' }`.
   The hint text was already corrected in WP-M6-15.
3. Test: the deadlines card links to `/admin/deadlines`, shows the available badge and no planned badge.

## Non-goals

- No change of the page itself.
- No object-type (Objektart) entry.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green.

## Handoff

- Files changed: see files-write
- Interfaces added: route `/admin/deadlines`
- Verified: typecheck, lint, test:run (670 tests), i18n:check, wp:check green; test:e2e skipped (no Chromium, unverified)
- Follow-up WP: none
- Open question: per-object-type deadlines (Objektart), see WP-M6-14
