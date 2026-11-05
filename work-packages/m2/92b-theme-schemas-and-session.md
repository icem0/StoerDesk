# WP-M2-92b: theme in the shared schemas and in the session

format: small-model
status: planned
depends-on: WP-M2-92 (theme column)
phase: 2
context-budget: 14k tokens
spec: PLAN.md §7 (session contract), PLAN.md §14 (theme)
spec-lines: 10

files-read:

- packages/shared/src/schemas/user.ts — `userLocaleSchema`, request schemas (WP-M1-09)
- packages/shared/src/schemas/auth.ts — `meResponseSchema` (WP-M1-07b)
- apps/api/src/auth/session.ts — `loadSession` reads the session user
- apps/api/src/auth/sessionPlugin.ts — `AuthUser` and the session hook

files-write:

- packages/shared/src/schemas/user.ts — `userThemeSchema`, theme in the request schemas
- packages/shared/src/schemas/auth.ts — `theme` in `meResponseSchema.user`
- apps/api/src/auth/session.ts — `loadSession` reads the theme column
- apps/api/src/auth/sessionPlugin.ts — `AuthUser` carries the theme

interfaces:

- `userThemeSchema = z.enum(['auto', 'light', 'dark'])`; `createUserRequestSchema.theme`
  (default `auto`) and `updateUserRequestSchema.theme` (optional)
- `meResponseSchema.user.theme` — the theme of the signed-in user
- `AuthUser.theme` — read from the `users` row of the session

## Task

1. `user.ts`: `export const userThemeSchema = z.enum(['auto', 'light', 'dark'])` next
   to `userLocaleSchema`; `theme: userThemeSchema.default('auto')` in
   `createUserRequestSchema`; `theme: userThemeSchema.optional()` in
   `updateUserRequestSchema`.
2. `auth.ts`: `theme: z.enum(['auto', 'light', 'dark'])` in `meResponseSchema.user`.
3. `session.ts`: `loadSession` selects `users.theme` next to the locale and returns it.
4. `sessionPlugin.ts`: `AuthUser` gains `theme: string`; the hook spreads it.

The admin API (user list, PATCH) owns the stored value in WP-M2-92c — the schemas
above only carry it.

## Non-goals

- No admin route change (WP-M2-92c), no web UI (WP-M2-92d/92e).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

## Handoff

- (filled by the implementing commit)
