format: small-model
status: planned
depends-on: WP-M1-08
phase: 4
context-budget: 12k tokens
spec: PLAN.md §5, specs/01-rbac.md §3.3–3.4
spec-lines: 45

files-read:

- packages/shared/src/permissions.ts
- specs/01-rbac.md
- PLAN.md §5
- docs/REPO-MAP.md

files-write:

- packages/shared/src/permissions.ts
- specs/01-rbac.md
- docs/REPO-MAP.md

interfaces:

- `PERMISSIONS.ticket.delete` = `'ticket.delete'` (extends the permission catalog)

## Task

Add the `ticket.delete` permission key so an admin can finally delete tickets
(`PLAN.md` §5 role `admin`, WP-M2-77 adds the guarded `DELETE /api/v1/tickets/:ticketNo`).

1. Add `delete: 'ticket.delete'` to `PERMISSIONS.ticket` and to `PERMISSION_KEYS`
   in `packages/shared/src/permissions.ts` (`PLAN.md` §5: `admin` receives every key
   via `...PERMISSION_KEYS`, so only `admin` can delete; no other role changes).
2. Add `| ticket.delete | – | – | – | – | x |` to the role–permission matrix of
   `specs/01-rbac.md` §3.3 and append `ticket.delete` after `ticket.cancel` in §3.4.
3. Update the public API row of `packages/shared/src/permissions.ts` in
   `docs/REPO-MAP.md`.

## Non-goals

- No API route, no service, no migration, no UI (those are WP-M2-76 … WP-M2-78).
- No soft-delete of tickets; this WP only adds the permission.

## Acceptance

Run and report the exact commands:

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected result: all green; `PERMISSION_KEYS` contains `ticket.delete` and the
matrix of `specs/01-rbac.md` matches the catalog.

## Handoff

- Files changed: `packages/shared/src/permissions.ts`, `specs/01-rbac.md`,
  `docs/REPO-MAP.md`
- Interfaces added: `PERMISSIONS.ticket.delete`
- Verified: typecheck, lint, vitest, `npm run wp:check`
- Follow-up WP: WP-M2-76 `076-ticket-delete-purge-log.md` (created in the same
  commit as this WP file)
- Open question: none
