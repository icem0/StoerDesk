# WP-M2-92b: theme through the session and the login response

format: small-model
status: implemented
depends-on: WP-M2-92 (theme column)
phase: 2
context-budget: 14k tokens
spec: PLAN.md §7 (session contract), PLAN.md §14 (theme)
spec-lines: 10

files-read:

- apps/api/src/auth/session.ts — `loadSession` reads the session user
- apps/api/src/auth/sessionPlugin.ts — `AuthUser` and the session hook
- apps/api/src/auth/routes.ts — login and `GET /api/v1/me`
- packages/shared/src/schemas/auth.ts — `meResponseSchema` (WP-M1-07b)

files-write:

- apps/api/src/auth/session.ts — `SessionUser.theme` and the `users.theme` column
- apps/api/src/auth/sessionPlugin.ts — `AuthUser.theme`
- apps/api/src/auth/routes.ts — the login response carries the theme

interfaces:

- `SessionUser.theme` and `AuthUser.theme` — the stored theme of the signed-in user
- the login response (`POST /api/v1/auth/login`) carries the theme next to the locale
- the response schema still strips the unknown key until WP-M2-92c adds it — the
  commit stays green

## Task

1. `session.ts`: `SessionUser` gains `theme: string`; `loadSession` selects
   `users.theme` and returns it.
2. `sessionPlugin.ts`: `AuthUser` gains `theme: string`.
3. `routes.ts`: the login route selects `users.theme` and answers it in the user
   object.

## Non-goals

- No schema change (WP-M2-92c), no web UI (WP-M2-92d/92e).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

## Handoff

- Files changed: `apps/api/src/auth/session.ts`, `apps/api/src/auth/sessionPlugin.ts`,
  `apps/api/src/auth/routes.ts`
- Interfaces added: `SessionUser.theme`, `AuthUser.theme`; the login response carries
  the stored theme next to the locale (the response schema strips the key until
  WP-M2-92c)
- Verified: `npm run check` green (DB integration tests skipped locally without
  PostgreSQL — unverified locally, CI has the service)
- Follow-up WP: WP-M2-92c (theme in the shared schemas and in the admin user API)
- Open question: none
