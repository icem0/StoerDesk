# WP-M2-92c: theme in the shared schemas and in the admin user API

format: small-model
status: implemented
depends-on: WP-M2-92b (theme in the session and the login response)
phase: 2
context-budget: 16k tokens
spec: PLAN.md §7 (admin user API), PLAN.md §14 (theme per user)
spec-lines: 10

files-read:

- packages/shared/src/schemas/user.ts — `userSummarySchema`, request schemas (WP-M1-09)
- packages/shared/src/schemas/auth.ts — `meResponseSchema` (WP-M1-07b)
- apps/api/src/admin/users.ts — user list, POST and PATCH routes (WP-M1-09)
- apps/api/src/admin/__tests__/users.integration.spec.ts — route tests

files-write:

- packages/shared/src/schemas/user.ts — `userThemeSchema`, theme in the schemas
- packages/shared/src/schemas/auth.ts — `theme` in `meResponseSchema.user`
- apps/api/src/admin/users.ts — list, create and PATCH carry the theme

interfaces:

- `userThemeSchema = z.enum(['auto', 'light', 'dark'])`; `userSummarySchema.theme`,
  `createUserRequestSchema.theme` (default `auto`), `updateUserRequestSchema.theme`
  (optional) and `meResponseSchema.user.theme`
- `GET /api/v1/users` answers the theme of every user; `POST /api/v1/users` stores the
  requested theme; `PATCH /api/v1/users/:id` stores the theme when the body carries one
- `GET /api/v1/me` answers the theme of the signed-in user

## Task

1. `user.ts`: `userThemeSchema` next to `userLocaleSchema`; `theme` on
   `userSummarySchema`, `createUserRequestSchema` (default `auto`) and
   `updateUserRequestSchema` (optional).
2. `auth.ts`: `theme: z.enum(['auto', 'light', 'dark'])` in `meResponseSchema.user`.
3. `users.ts`: `UserRow` gains `theme`; the list select reads `users.theme`; the
   create route inserts the theme and returns it; the PATCH route writes
   `theme: body.theme ?? target.theme` next to the locale.
4. `users.integration.spec.ts`: the PATCH stores the theme and the list answers it.

## Non-goals

- No self-service route for non-admins (`/me` carries the own theme).
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

- Files changed: `packages/shared/src/schemas/user.ts`,
  `packages/shared/src/schemas/auth.ts`, `apps/api/src/admin/users.ts`,
  `apps/web/src/admin/users-page.tsx` (create form carries the theme),
  `apps/api/src/admin/__tests__/users.integration.spec.ts` (test),
  `apps/web/src/admin/__tests__/users-page.test.tsx` (test)
- Interfaces added: `userThemeSchema` (auto/light/dark), `theme` on
  `userSummarySchema`, `createUserRequestSchema` (default auto),
  `updateUserRequestSchema` (optional) and `meResponseSchema.user`; the admin API
  reads, stores and answers the theme, `GET /api/v1/me` answers the own theme
- Verified: `npm run check` green — the API integration test proves the PATCH stores
  the theme and the list answers it (PostgreSQL was reachable locally)
- Follow-up WP: WP-M2-92d (theme class in the shell and the light palette)
- Open question: none
