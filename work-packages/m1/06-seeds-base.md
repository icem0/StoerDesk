# WP-M1-06: Base seed — bootstrap administrator

format: small-model
depends-on: WP-M1-05
phase: 1
context-budget: 20k tokens
spec: specs/01-rbac.md §3.1, §3.5, §4.1; PLAN.md §4 (Argon2id), §16 (exit criterion
"login as admin works")
spec-lines: 40

files-read:

- PLAN.md (§4, §6, §16)
- specs/01-rbac.md (§3.1, §3.5, §4.1)
- apps/api/src/db/schema.ts (`users`, `user_roles`)
- apps/api/src/db/seed-rbac.ts
- apps/api/src/config/env.ts
- .env.example (§Seed data)

files-write:

- apps/api/src/auth/password.ts
- apps/api/src/db/seed-base.ts
- apps/api/src/config/env.ts

interfaces:

- `hashPassword(plain: string): Promise<string>`,
  `verifyPassword(hash: string, plain: string): Promise<boolean>`
- `seedBaseUser(database, credentials): Promise<BaseSeedResult>` with
  `SeedAdminCredentials = { email: string; password: string }` — run the seed with
  `npx tsx src/db/seed-base.ts`
- env contract: `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` (already documented in
  `.env.example`, no new variables)

## Task

1. Install the hashing library: `npm install argon2 -w @stoerdesk/api`. Version 0.45
   ships `prebuilds/*/argon2.glibc.node` **and** `argon2.musl.node`, so the
   `node:22-alpine` API image needs no compiler toolchain.
2. `apps/api/src/auth/password.ts`: `hashPassword` with Argon2id and the library
   defaults (memory 65536 KiB, iterations 3, parallelism 4), `verifyPassword` that
   resolves to `false` for a malformed or empty stored hash instead of throwing.
   Unit test `apps/api/src/auth/__tests__/password.spec.ts`: hash starts with
   `$argon2id$`, same password verifies, wrong password and broken hash return
   `false`.
3. `apps/api/src/config/env.ts`: the two `SEED_ADMIN_*` variables stay optional, but
   when one is set the other must be set too, `SEED_ADMIN_EMAIL` must parse as an
   e-mail and `SEED_ADMIN_PASSWORD` must be at least 12 characters. The error text
   names only the variable, never the value.
4. `apps/api/src/db/seed-base.ts` exports `seedBaseUser(database, credentials)` and
   runs as `npx tsx src/db/seed-base.ts` with the two `SEED_ADMIN_*` values from
   `DATABASE_URL`-configured environment:
   - the e-mail is trimmed and stored lower case, so the unique index on
     `users.email` cannot be bypassed by case or whitespace,
   - with an empty e-mail or password it does nothing and
     reports `{ seed: 'base', status: 'skipped' }`,
   - otherwise it inserts the user with `onConflictDoNothing` on `users.email`
     (Argon2id hash, `active = true`, `locale` default `de`),
   - then links the user to the system role `admin` through `user_roles` with
     `onConflictDoNothing`; if the `admin` role is missing it fails with the error
     `rbac_seed_missing`, because `seed-rbac.ts` must run first,
   - an existing user keeps its current `password_hash`, `locale` and `active`
     values — a re-run never resets a changed password,
   - the CLI output never contains the e-mail address or the password (no PII in
     logs): `{ seed: 'base', status: 'created' | 'existing' | 'skipped' }`.
5. Integration test `apps/api/src/db/__tests__/seed-base.integration.spec.ts`
   (excluded from `files-write` per `PLAN.md` §17): after migrate + `seedRbac` +
   `seedBaseUser` exactly one active user exists, its hash starts with
   `$argon2id$`, `verifyPassword` accepts the seed password, the user is linked to
   the `admin` role, a second run creates nothing new and keeps a manually changed
   hash, an empty env seeds nothing, and without the RBAC seed the call fails with
   `rbac_seed_missing`. Skipped when no database is reachable.

## Non-goals

- No login route, no session, no cookie, no `/me` — that is WP-M1-07, which reuses
  `verifyPassword`.
- No `requirePermission` (WP-M1-08), no admin UI, no user or role management and no
  password change (WP-M1-09).
- No `objects`, `systems`, `text_templates` or `text_template_translations` tables
  and no example objects or standard texts — those moved to **WP-M2-00**
  (`work-packages/m2/00-core-tables-seed.md`), because `PLAN.md` §16 puts objects in
  phase 2.
- No password policy beyond the minimum length, no login rate limit (WP-M1-07), no
  password rotation.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

With a reachable database (`TEST_DATABASE_URL`) the new integration spec must run and
pass, including the second idempotent seed run. Without a database it is skipped and
the skip must be reported: run `npx tsx src/db/migrate.ts`,
`npx tsx src/db/seed-rbac.ts` and `npx tsx src/db/seed-base.ts` twice against a real
PostgreSQL 16 and report both outputs.

## Handoff

- Files changed: the three files above plus the two test files and the bookkeeping
  outside `files-write` (`docs/REPO-MAP.md`, `AGENTS.md`, `CHANGELOG.md`, README)
- Interfaces added: `hashPassword`, `verifyPassword`, `seedBaseUser` and the
  validated `SEED_ADMIN_*` env contract
- Seed order: `migrate` → `seed-rbac` → `seed-base`
- Follow-up WP: WP-M1-07 auth (login, session, `/me`) — with it the phase 1 exit
  criterion "login as admin works" becomes reachable
- Verified: `npm run check` and `npm run build` green; without a database the three
  database specs skip. Against a reachable PostgreSQL `seed-rbac` gives 5 roles,
  37 permissions and 91 grants, `seed-base` twice gives `created` then `existing`,
  and the specs pass with 5 (base seed), 7 (rbac) and 6 (base tables) tests. This
  container has no PostgreSQL of its own: the local stand-in was PGlite (WASM,
  engine 18.6) over a TCP socket, PostgreSQL 16 runs as the CI `check` service.
