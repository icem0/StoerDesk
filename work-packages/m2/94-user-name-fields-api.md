# WP-M2-94: name fields in the shared user schemas and the admin user API

format: small-model
status: planned
depends-on: WP-M2-93 (`given_name` and `family_name` columns)
phase: 2
context-budget: 14k tokens
spec: PLAN.md §7 (admin user API), PLAN.md §6 (`users` name columns), specs/01-rbac.md §4.1
spec-lines: 10

files-read:

- packages/shared/src/schemas/user.ts — `userSummarySchema`, create and update request schemas (WP-M1-09)
- apps/api/src/admin/users.ts — `UserRow`, the list select, the POST and PATCH routes (WP-M1-09)
- apps/api/src/admin/__tests__/users.integration.spec.ts — route tests
- apps/api/src/db/schema.ts — `users.given_name` / `users.family_name` (WP-M2-93)

files-write:

- packages/shared/src/schemas/user.ts — `userNameSchema`, names in the schemas
- apps/api/src/admin/users.ts — list, create and PATCH carry the names

interfaces:

- `userNameSchema = z.string().trim().max(64)` — `''` means unset
- `userSummarySchema.givenName` / `familyName`, `createUserRequestSchema` (both default
  `''`) and `updateUserRequestSchema` (both optional)
- `GET /api/v1/users` answers both names of every user; `POST /api/v1/users` stores the
  requested names; `PATCH /api/v1/users/:id` writes a name only when the body carries one

## Task

1. `user.ts`: `userNameSchema` next to `userLocaleSchema`; `givenName` and `familyName`
   on `userSummarySchema`, on `createUserRequestSchema` with `.default('')` and on
   `updateUserRequestSchema` with `.optional()`.
2. `users.ts`: `UserRow` gains `givenName` and `familyName`; the list select reads
   `users.givenName` and `users.familyName`; the create route inserts them; the PATCH
   route writes `body.givenName ?? current.givenName` and the same for the family name.
3. `users.integration.spec.ts` (test): the create stores the names, the PATCH replaces
   one name and keeps the other, the list answers both.

## Non-goals

- No `/me` and no session change — the klarmname is admin-facing; a later WP carries it.
- No web UI — the users page shows the names in a later WP of the same chain.
- No name in the public report path or in ticket history (`tickets.reporter_*` stay).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green. The API tests need PostgreSQL; without a database they are skipped
and reported as unverified locally — the CI run has the service.

## Handoff

- Files changed: —
- Interfaces added: —
- Follow-up WP: none
- Open question: none
