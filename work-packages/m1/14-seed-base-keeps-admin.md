# WP-M1-14: Base seed keeps an existing administrator untouched

format: small-model
depends-on: WP-M1-13
phase: 1
context-budget: 15k tokens
spec: `work-packages/m1/06-seeds-base.md` §4 (seed-base contract) — the seed
inserts with `onConflictDoNothing`, an existing user keeps `password_hash`,
`locale` and `active`
spec-lines: 24

files-read:

- apps/api/src/db/seed-base.ts
- apps/api/src/db/__tests__/seed-base.integration.spec.ts
- apps/api/src/db/schema.ts
- apps/api/src/auth/password.ts
- work-packages/m1/06-seeds-base.md
- apps/api/src/index.ts

files-write:

- apps/api/src/db/seed-base.ts

interfaces:

- `seedBaseUser(database, credentials): Promise<BaseSeedResult>` — the signature
  and the status values `created | existing | skipped` stay unchanged; only the
  insert strategy and the status detection change.

## Task

1. `apps/api/src/db/seed-base.ts`: replace the `onConflictDoUpdate` with
   `onConflictDoNothing` on `users.email` and decide the status from the row
   that is really there:
   - look the user up by e-mail **before** the insert,
   - `created` when no row exists and the insert returns one,
   - `existing` when the row was already there.
   `onConflictDoUpdate` cannot report this: PostgreSQL `RETURNING` returns the
   updated row as well, so the old `inserted.length === 1` was always true and
   the status was always `created`.
2. The insert must not carry `password_hash`, `locale` or `active` of an
   existing user. A re-run never resets a changed password — the contract of
   `work-packages/m1/06-seeds-base.md` §4 and the reason the integration test
   asserts a manually changed hash afterwards.
3. Keep the role link repair (`onConflictDoNothing` on `user_roles`) and the
   `rbac_seed_missing` error unchanged.

## Non-goals

- No password rotation of an existing administrator: changing
  `SEED_ADMIN_PASSWORD` does **not** change the password of an existing
  account, that stays an explicit admin action (WP-M1-09).
- No change of the integration test — it encodes the specified behaviour and
  fails today because the seed broke it.
- No UI, no API route, no other seed.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

With a reachable database the integration test `seed-base.integration.spec.ts`
passes: the first run reports `created`, the second run reports `existing`, the
manually changed hash and the locale stay untouched and the role link is
restored.

## Handoff

- Files changed: `apps/api/src/db/seed-base.ts` only
- The red `check` runs v0.0.58 … v0.0.61 are fixed by this package — the cause
  was commit 82a9fc7, which changed the insert to `onConflictDoUpdate` without
  the status detection and the test.
- Open question: none
