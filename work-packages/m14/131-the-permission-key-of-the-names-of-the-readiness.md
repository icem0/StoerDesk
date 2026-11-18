# WP-M14-131: the permission key of the names of the readiness

format: small-model
status: done
depends-on: WP-M14-87, WP-M14-130
phase: 14
milestone: m14
context-budget: 14k tokens
spec: PLAN.md §5, §8; specs/01-rbac.md §3.3, §3.4, §3.7
spec-lines: 120

files-read:

- packages/shared/src/permissions.ts (the catalog and the default roles)
- packages/shared/src/__tests__/permissions.test.ts (the sizes of the matrix)
- specs/01-rbac.md (§3.3 the matrix, §3.4 the catalog, §3.7 the guard)
- apps/api/src/db/__tests__/rbac.integration.spec.ts (the seed of the roles)
- apps/web/src/features/oncall/readiness-calendar.tsx (where the names are shown)
- PLAN.md §8 (the readiness calendar)

files-write:

- packages/shared/src/permissions.ts
- specs/01-rbac.md

interfaces:

- `PERMISSIONS.oncall.readNames` — the key `oncall.read_names`
- `PERMISSION_KEYS` — the catalog grows from 39 to 40 keys
- `DEFAULT_ROLES.admin` — holds every catalog key, so the new key with it

## Task

The office asked that the names of the technicians in the readiness calendar
belong to the admins and to nobody else — or to a role the administration
activates. The calendar itself is read by `oncall.read` (`specs/04-oncall.md`
§4a.2), so today every role that reads the plan of the readiness also sees
who has it. The names need a right of their own, so a role can be switched on
for them.

1. `packages/shared/src/permissions.ts`: the catalog gains the key
   `oncall.read_names` (accessor `readNames`) in the group `oncall`, and
   `PERMISSION_KEYS` lists it after `oncall.admin`. The `admin` role holds
   every catalog key through `...PERMISSION_KEYS` and therefore holds the new
   key; the other four system roles keep their sizes.
2. `specs/01-rbac.md` §3.3: the matrix gains the row `oncall.read_names` with
   the `admin` role only, the totals are corrected (the catalog holds 39 keys
   today, not 38) and the assignment is written down: the names are a right of
   their own, the gate is in the web app, the API keeps answering the names to
   `oncall.read` (the members of a pool are the candidates of a swap).
3. `specs/01-rbac.md` §3.4 lists the new key in the catalog, §4.1 corrects the
   number of the rows of `permissions`.

## Non-goals

- No change of the API, of the routes or of the seed: `seed-rbac.ts` writes the
  catalog of `permissions.ts`, so the new key is seeded with the next run.
- No change of the readiness calendar — the gate in the web app is
  **WP-M14-132**.
- No new role, no change of the four other system roles, no change of
  `user_permissions`.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the catalog test stays green (the sizes of `office`,
`oncall` and `manager` do not change, `admin` follows the catalog) and the
seed test proves that `admin` holds every catalog key.

## Handoff

- Files changed: `packages/shared/src/permissions.ts`, `specs/01-rbac.md`, this
  document, `work-packages/README.md`, `CHANGELOG.md`, `docs/REPO-MAP.md`,
  `PLAN.md` §8 and §16
- Interfaces added: `PERMISSIONS.oncall.readNames` (`oncall.read_names`)
- Verified: `npm run typecheck --workspaces --if-present`, `npm run lint` (0
  errors, 13 pre-existing warnings), `npm run test:run` (1418 tests, 205 files),
  `npm run i18n:check` (1617 keys in `de` and `en`), `npm run wp:check` (555
  small-model WP, 0 failed)
- Follow-up WP: WP-M14-132 (the readiness calendar honours the key)
- Open question: none
