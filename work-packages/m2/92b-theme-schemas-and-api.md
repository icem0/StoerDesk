# WP-M2-92b: theme through shared schemas and the API

format: small-model
status: planned
depends-on: WP-M2-92 (theme column)
phase: 2
context-budget: 14k tokens
spec: PLAN.md §7 (admin user API), PLAN.md §14 (theme)
spec-lines: 10

files-read:

- packages/shared/src/schemas/user.ts — `userSummarySchema`, `updateUserRequestSchema` (WP-M1-09)
- packages/shared/src/schemas/auth.ts — `meResponseSchema` (WP-M1-07b)
- apps/api/src/admin/users.ts — user list/POST/PATCH routes (WP-M1-09)
- apps/api/src/auth/routes.ts — `GET /api/v1/me` handler (WP-M1-07b)

files-write:

- packages/shared/src/schemas/user.ts — `theme` on summary, create and update schemas
- packages/shared/src/schemas/auth.ts — `theme` on `meResponseSchema.user`
- apps/api/src/admin/users.ts — PATCH accepts and stores `theme` (route)
- apps/api/src/auth/routes.ts — `/me` answers the user's `theme` (route)

interfaces:

- `userThemeSchema = z.enum(['auto','light','dark'])`; `userSummarySchema.theme`,
  `createUserRequestSchema.theme` (default `'auto'`), `updateUserRequestSchema.theme`
  (optional) and `meResponseSchema.user.theme`
- `PATCH /api/v1/users/:id` writes `theme` when present; `GET /api/v1/me` answers the
  stored value — the web shell reads it for the user's own theme (WP-M2-92c)

## Task

1. `user.ts`: `export const userThemeSchema = z.enum(['auto', 'light', 'dark'])`
   next to `userLocaleSchema`; add `theme: userThemeSchema` to `userSummarySchema`,
   `theme: userThemeSchema.default('auto')` to `createUserRequestSchema`,
   `theme: userThemeSchema.optional()` to `updateUserRequestSchema`.
2. `auth.ts`: `theme: z.enum(['auto', 'light', 'dark'])` in `meResponseSchema.user`.
3. `users.ts`: PATCH body already piped through `updateUserRequestSchema` — store
   `theme` in the same update object; the list route maps the column (it already
   returns the summary fields).
4. `auth/routes.ts`: add `theme: user.theme` to the `/me` user object.

## Non-goals

- No web UI (WP-M2-92c), no DB change (WP-M2-92 owns it).
- No self-service theme route for non-admins (the admin edits users; own value via `/me`).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

## Handoff

- (filled by the implementing commit)
