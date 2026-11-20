# WP-M16-11: the sort direction of the ticket list sits under „Darstellung“

format: small-model
status: in_progress
depends-on: WP-M16-02
phase: 16
milestone: m16
context-budget: 8k tokens
spec: PLAN.md §14; specs/13-ui.md
spec-lines: 30

files-read:

- PLAN.md (§14 user interface, §16 phase roadmap)
- specs/13-ui.md (§14)

files-write:

- work-packages/m16/11a-the-backend-sort-direction.md
- work-packages/m16/11b-the-frontend-sort-direction.md
- work-packages/m16/11c-the-page-tests.md

interfaces:

- `ticketSortDirection` (`'asc' | 'desc'`, default `'desc'`) in the branding row and in
  `GET /api/v1/settings/display`
- the checkbox „Neueste zuerst“ / „Newest first“ on the form of the Darstellung
- the ticket list at `/tickets` orders by `reportedAt` in the configured direction

## Task

Split the change into the children below, all created in this same commit:

1. **WP-M16-11a** — the backend: `ticketSortDirection` in the shared settings schema
   (`packages/shared/src/schemas/settings.ts`) and in the branding/display routes
   (`apps/api/src/settings/branding.ts`), plus its integration test.
2. **WP-M16-11b** — the frontend: the „Neueste zuerst“ checkbox on the Darstellung
   form (`apps/web/src/settings/branding-page.tsx`), the direction applied to the
   ticket list (`apps/web/src/features/tickets/ticket-list-page.tsx`) and the two
   locale files (`common.json` de/en).
3. **WP-M16-11c** — the page tests for the branding page and the ticket list page.

## Non-goals

- No new database table or migration: the direction travels in the existing jsonb
  `branding` settings row.
- No change of the dashboard or wall-display order: only `/tickets` is affected.
- No per-user preference: the direction is an instance value under „Darstellung“.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run i18n:check
npm run test:run
npm run wp:check
```

Expected: all green.

## Handoff

- Files changed: `packages/shared/src/schemas/settings.ts`,
  `apps/api/src/settings/branding.ts`, `apps/api/src/settings/__tests__/branding.integration.spec.ts`,
  `apps/web/src/settings/branding-page.tsx`, `apps/web/src/settings/__tests__/branding-page.test.tsx`,
  `apps/web/src/features/tickets/ticket-list-page.tsx`,
  `apps/web/src/features/tickets/__tests__/ticket-list-page.test.tsx`, the two
  `common.json` locale files, this WP document and the three child WP documents,
  `work-packages/README.md` (the backlog row) and `PLAN.md` (§16 current state)
- Interfaces added: `ticketSortDirection` in the branding/display contracts, the
  checkbox under „Darstellung“, the direction parameter of the ticket list
- Verified: `npm run typecheck`, `npm run lint`, `npm run i18n:check`,
  `npm run test:run`, `npm run wp:check`
- Follow-up WP: none
- Open question: none
