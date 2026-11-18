# WP-M14-148b: the contracts of the open password change

format: small-model
status: planned
phase: 14
milestone: m14
context-budget: 12k tokens
spec: specs/01-rbac.md §3.9
spec-lines: 20

depends-on: WP-M14-148a

files-read:

- packages/shared/src/schemas/auth.ts (the login and the `me` contract)
- packages/shared/src/schemas/user.ts (the user summary)
- packages/shared/src/__tests__/ (the tests of the contracts)

files-write:

- packages/shared/src/schemas/auth.ts
- packages/shared/src/schemas/user.ts

interfaces:

- `meResponseSchema.user.mustChangePassword` — boolean, default `false`: the flag
  of an open password change in the login answer and in `GET /api/v1/me`
- `userSummarySchema.mustChangePassword` — boolean, default `false`: the same
  flag per row of the user list
- `resetPasswordResponseSchema` — `{ temporaryPassword }`, the answer of
  `POST /api/v1/users/:id/password`

## Task

1. `packages/shared/src/schemas/auth.ts`: the user of `meResponseSchema` gains
   `mustChangePassword: z.boolean().default(false)`. The default keeps the
   contract valid for every caller that does not know the flag yet — the API
   answers the real value from WP-M14-148c on.
2. The same file: the answer of the reset,
   `resetPasswordResponseSchema = z.object({ temporaryPassword: z.string().min(1) })`
   with the type `ResetPasswordResponse`. The plaintext is a string, never a
   hash and never an empty value.
3. `packages/shared/src/schemas/user.ts`: the summary gains
   `mustChangePassword: z.boolean().default(false)`, so the administration sees
   in the user list which colleagues still hold a one-time password.
4. The shared tests gain the cases: the flag of the `me` answer and of the user
   summary defaults to `false`, a `true` survives the parse, the answer of the
   reset keeps the plaintext.

## Non-goals

- No API, no database write, no UI (WP-M14-148c … WP-M14-148f).
- No hash of the password in a contract: the plaintext leaves the server once
  and is never stored.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
```

Expected: all green; the new tests fail before the change and pass after it.

## Handoff

- Files changed: `packages/shared/src/schemas/auth.ts`,
  `packages/shared/src/schemas/user.ts`, the shared tests, this document,
  `work-packages/README.md`, `CHANGELOG.md`, `PLAN.md` §16
- Interfaces added: `mustChangePassword`, `resetPasswordResponseSchema`
- Verified: `npm run check`
- Follow-up WP: WP-M14-148c
- Open question: none
