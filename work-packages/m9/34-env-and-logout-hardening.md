# WP-M9-34: `SESSION_SECRET` min length + logout cookie presence (SEC-016, SEC-006)

format: small-model
status: done
depends-on: WP-M9-33
phase: 9
milestone: m9
context-budget: 8k tokens
spec: PLAN.md §15 (audit — SEC-016, SEC-006); specs/01-authentication.md §3.x (session, logout)
spec-lines: 16

files-read:

- apps/api/src/config/env.ts (SESSION_SECRET default rule)
- apps/api/src/auth/routes.ts (logout route)
- apps/api/src/auth/session.ts (destroySession semantics)

files-write:

- apps/api/src/config/env.ts
- apps/api/src/auth/routes.ts

interfaces:

- `SESSION_SECRET` schema gains `.min(32)`; the dev default is 37 chars, so it still
  passes.
- Logout destroys the session only when the `SESSION_COOKIE_NAME` cookie is present
  and non-empty; the answer shape (204, cleared cookie) is unchanged.

## Task

1. `apps/api/src/config/env.ts`: `SESSION_SECRET: z.string().min(32).default(developmentSecret)`.
2. `apps/api/src/auth/routes.ts`: in the logout route read the session cookie into
   `token`; only call `destroySession` when `token !== undefined && token !== ''`;
   always clear the cookie and answer 204.

## Non-goals

- No new DB row, no schema migration, no UI change.
- CSRF/Origin enforcement stays a deployment concern (HSTS + `SameSite=Lax` default);
  this WP only requires cookie presence, the low-cost first line of defence.

## Acceptance

```bash
npm run check
```

Expected: green — the logout spec's tests all send the session cookie, so behaviour
is unchanged for real logins.

## Handoff

- Files changed: the two above
- Interfaces added: none
- Verified: `npm run check`
- Follow-up WP: WP-M9-35 (remove dead `prefix` on the on-call pools plugin, SEC-010)
- Open question: none
