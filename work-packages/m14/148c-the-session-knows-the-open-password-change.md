# WP-M14-148c: the session knows the open password change

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 18k tokens
spec: specs/01-rbac.md §3.9, §3.6, §3.7
spec-lines: 40

depends-on: WP-M14-148b

files-read:

- apps/api/src/auth/session.ts (the session and the user of a session)
- apps/api/src/auth/sessionPlugin.ts (`request.user`, `requireUser`)
- apps/api/src/auth/requirePermission.ts (the permission guard)
- apps/api/src/auth/routes.ts (the login, the `me` endpoint, `PATCH /api/v1/users/me`)

files-write:

- apps/api/src/auth/session.ts
- apps/api/src/auth/sessionPlugin.ts
- apps/api/src/auth/requirePermission.ts
- apps/api/src/auth/routes.ts

interfaces:

- `SessionUser.mustChangePassword` — the flag of the user of a session
- `destroyUserSessions(database, userId, keepTokenHash?)` — the sessions of a
  user die with the secret
- `rejectPendingPasswordChange(request, reply)` — `403 { code:
  'password_change_required' }` while the flag is set
- the route config `allowPendingPasswordChange` — the two exemptions:
  `GET /api/v1/me` and `PATCH /api/v1/users/me`

## Task

1. `apps/api/src/auth/session.ts`: the session reads the flag with the user
   (`users.must_change_password`) and carries it in `SessionUser`. The new
   function `destroyUserSessions(database, userId, keepTokenHash?)` deletes the
   sessions of a user — with a token hash it keeps that one session.
2. `apps/api/src/auth/sessionPlugin.ts`: `AuthUser` gains
   `mustChangePassword`. The new helper `rejectPendingPasswordChange(request,
   reply)` answers `403 { code: 'password_change_required' }` while the flag of
   the user is set — unless the route carries the config
   `allowPendingPasswordChange`. `requireUser` calls the helper after the
   `401` of the missing session.
3. `apps/api/src/auth/requirePermission.ts`: the guard calls the same helper,
   so a route behind `requirePermission` is blocked as well — the answer of a
   missing session stays `401`, the answer of a missing right stays `403
   forbidden`.
4. `apps/api/src/auth/routes.ts`: the login answer and `GET /api/v1/me` carry
   `mustChangePassword`. `PATCH /api/v1/users/me` clears the flag while it
   writes the own password, and it keeps the other sessions of the user alive
   only for the current one — the own change deletes the sessions of the other
   devices. `GET /api/v1/me` and `PATCH /api/v1/users/me` carry the config
   `allowPendingPasswordChange`, so they stay reachable while the flag is set.
5. The integration test of the auth routes gains the cases: the login carries
   the flag, a guarded route answers `403 password_change_required` while the
   flag is set, `/me` and `PATCH /users/me` stay reachable, and the own change
   clears the flag.

## Non-goals

- No administration route and no generator (WP-M14-148d).
- No UI: the client shows the form of WP-M14-148e.
- No change of the login rate limit and no change of the answers of a wrong
  password (§3.6).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
```

Expected: all green; the new tests fail before the change and pass after it.

## Handoff

- Files changed: the four modules of the session and the auth routes, their
  tests, this document, `work-packages/README.md`, `CHANGELOG.md`, `PLAN.md` §16
- Interfaces added: the flag in the session, `destroyUserSessions`,
  `rejectPendingPasswordChange`, the code `password_change_required`
- Verified: `npm run check`
- Follow-up WP: WP-M14-148d
- Open question: none
