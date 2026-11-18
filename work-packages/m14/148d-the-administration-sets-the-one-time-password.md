# WP-M14-148d: the administration sets the one-time password

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 16k tokens
spec: specs/01-rbac.md §3.9; docs/DECISIONS/0031-the-administration-hands-over-a-one-time-password.md
spec-lines: 30

depends-on: WP-M14-148c

files-read:

- apps/api/src/auth/password.ts (the Argon2id helpers)
- apps/api/src/admin/users.ts (the admin user API and its errors)
- packages/shared/src/schemas/auth.ts (the answer of the reset)

files-write:

- apps/api/src/auth/password.ts
- apps/api/src/admin/users.ts

interfaces:

- `generateTemporaryPassword()` — 20 characters out of an alphabet without `O`,
  `0`, `I`, `l`, `1`
- `POST /api/v1/users/:id/password` (`user.write`) — the administration sets the
  password of a user
- the answer `{ temporaryPassword }` — the plaintext of the one-time password,
  exactly once

## Task

1. `apps/api/src/auth/password.ts`: the new function `generateTemporaryPassword`
   draws 20 characters from the alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ` +
   `abcdefghijkmnpqrstuvwxyz` + `23456789` with `randomInt` of
   `node:crypto` — no modulo bias, no ambiguous character, because the password
   is read aloud and typed by hand.
2. `apps/api/src/admin/users.ts`: the route `POST /api/v1/users/:id/password`
   behind `user.write` writes the hash of the generated password, sets
   `must_change_password = true` and deletes the sessions of that user — the
   old password and every open session of the account die with the reset. The
   answer carries the plaintext once: `{ temporaryPassword }`. An unknown id
   answers `404 { code: 'user_not_found' }`, a malformed id `400
   { code: 'invalid_request' }`.
3. The same file: the user list carries `mustChangePassword` per row, so the
   administration sees the colleagues who still hold a one-time password.
4. The route logs no value — the log line of the reset carries the code only,
   never the plaintext and never the e-mail of the account.
5. The integration test of the admin users gains the cases: the reset answers
   the plaintext once, the account carries the flag, the old password does not
   log in any more, the new one does, the sessions of the account are gone and
   the answer never carries the hash.

## Non-goals

- No UI (WP-M14-148f) and no form for the colleague (WP-M14-148e).
- No second password of the same account, no list of the one-time passwords and
  no re-send of a handed-over secret.
- No e-mail, no link, no token (ADR-0031).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
```

Expected: all green; the new tests fail before the change and pass after it.

## Handoff

- Files changed: `apps/api/src/auth/password.ts`, `apps/api/src/admin/users.ts`,
  their tests, this document, `work-packages/README.md`, `CHANGELOG.md`,
  `PLAN.md` §16, `docs/REPO-MAP.md`
- Interfaces added: `generateTemporaryPassword`, the route
  `POST /api/v1/users/:id/password`
- Verified: `npm run check`
- Follow-up WP: WP-M14-148e
- Open question: none
