# WP-M23-10: the admin hands a shift over

format: ctx-256k
status: done
depends-on: WP-M23-09f
phase: 23
milestone: m23
context-budget: 40k tokens
spec: specs/04-oncall.md §4a.3, §4a.5
spec-lines: 60
changed-lines: 260

files-read:

- apps/api/src/oncall/service.ts (the assignment of a shift)
- apps/api/src/oncall/swaps.ts (the swaps of a shift)
- apps/api/src/oncall/__tests__/service.integration.spec.ts (the test of the service)
- apps/web/src/features/oncall/shift-admin-actions.tsx (the actions of the admin)
- apps/web/src/features/oncall/planning-section.tsx (the weekly plan)
- specs/04-oncall.md §4a.3 (the transitions of a shift)

files-write:

- apps/api/src/oncall/service.ts
- apps/api/src/oncall/__tests__/service.integration.spec.ts
- apps/web/src/features/oncall/shift-admin-actions.tsx, apps/web/src/features/oncall/planning-section.tsx
- apps/web/src/features/oncall/__tests__/shift-admin-actions.test.tsx
- apps/web/src/i18n/locales/de/oncall.json, apps/web/src/i18n/locales/en/oncall.json
- specs/04-oncall.md
- work-packages/m23/10-the-admin-hands-a-shift-over.md, work-packages/README.md, PLAN.md, CHANGELOG.md, docs/REPO-MAP.md

interfaces:

- `updateShift(database, shiftId, patch, actorUserId)` — an admin may hand a
  `CONFIRMED` or `SWAP_REQUESTED` shift over; the shift goes back to `PLANNED`
  with the new technician
- `ShiftAdminActions({ shift, onChanged })` — the actions of the admin name the
  handover of a confirmed shift in its own words

## Task

1. The transitions of §4a.3 and `PLAN.md` §8 promise that an admin may
   reassign a shift after it started — the handover of a duty that the office
   has to cover otherwise. The service refused it: the states of the table of
   §4a.3 (`CREATABLE_STATES`) held no `CONFIRMED` and no `SWAP_REQUESTED`, so
   the answer was `409 oncall_shift_invalid_transition` — the promise of the
   spec was not kept.
2. The admin may now hand a `CONFIRMED` or a `SWAP_REQUESTED` shift over. The
   shift goes to `PLANNED` with the new technician: it counts for the coupling
   again, the new technician has to accept it, and the announcement reaches him
   (`WP-M23-08`). The handover belongs to the admin alone — the service checks
   `oncall.admin` again, so the rule holds whoever calls the function.
3. The reassign of a `SWAP_REQUESTED` shift cancels the open swap and writes
   `swap_cancelled`, as §4a.3 demands. The technician of the shift keeps his
   place in the history of the shift.
4. The interface names the handover in its own words — „Neuer Techniker" and
   „Übergeben" — and the weekly plan keeps a handed-over shift published.
5. Name the rule in `specs/04-oncall.md` §4a.3.

## Non-goals

- No new permission key — `oncall.admin` stays as it is.
- No change of the swap flow of the technicians.
- No change of the delete rule of `ADR-0047`.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new tests fail before the change and pass after it.

## Handoff

- Files changed: the service of the shifts, its test, the actions of the admin,
  the weekly plan, the locales, the spec of the readiness and the bookkeeping
- Interfaces added: none — the rule of `updateShift` changed
- Verified: the commands above
- Follow-up WP: none
- Open question: none
