# WP-M2-92c: theme in the admin user API

format: small-model
status: planned
depends-on: WP-M2-92b (theme in the request schemas)
phase: 2
context-budget: 14k tokens
spec: PLAN.md §7 (admin user API), PLAN.md §14 (theme per user)
spec-lines: 10

files-read:

- packages/shared/src/schemas/user.ts — `userSummarySchema`, request schemas (WP-M1-09)
- apps/api/src/admin/users.ts — user list, POST and PATCH routes (WP-M1-09)
- apps/api/src/admin/__tests__/users.integration.spec.ts — route tests

files-write:

- packages/shared/src/schemas/user.ts — `theme` on `userSummarySchema`
- apps/api/src/admin/users.ts — list, create and PATCH carry the theme

interfaces:

- `userSummarySchema.theme` — the stored theme of a user
- `GET /api/v1/users` answers the theme of every user; `POST /api/v1/users` stores the
  requested theme (default `auto`); `PATCH /api/v1/users/:id` stores the theme when
  the body carries one

## Task

1. `user.ts`: `theme: userThemeSchema` on `userSummarySchema`.
2. `users.ts`: `UserRow` gains `theme`; the list select reads `users.theme`; the
   create route inserts the theme and returns it; the PATCH route writes
   `theme: body.theme ?? target.theme` next to the locale.
3. `users.integration.spec.ts`: the PATCH stores the theme and the list answers it.

## Non-goals

- No self-service route for non-admins (`/me` carries the own theme, WP-M2-92b).
- No web UI (WP-M2-92d/92e).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

The API tests need PostgreSQL; without a database they are skipped and reported as
unverified locally — the CI run has the service.

## Handoff

- (filled by the implementing commit)
