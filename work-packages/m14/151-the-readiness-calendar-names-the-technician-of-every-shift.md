# WP-M14-151: the readiness calendar names the technician of every shift

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 18k tokens
spec: specs/04-oncall.md §4a.2, §4a.3, §4a.8; PLAN.md §8; specs/01-rbac.md §3.7
spec-lines: 60

depends-on: WP-M14-147d

files-read:

- apps/web/src/features/oncall/readiness-calendar.tsx (the month grid, the names)
- apps/api/src/oncall/routes.ts (the shift list, the members route)
- packages/shared/src/schemas/oncall.ts (`oncallShiftSchema`, `oncallMemberSchema`)
- apps/api/src/oncall/members.ts (the members of a pool — the swap candidates)
- specs/04-oncall.md (§4a.2 the pool, §4a.3 the shift, §4a.8 the routes)
- PLAN.md §8 (the readiness calendar, the right to the names)

files-write:

- packages/shared/src/schemas/oncall.ts, apps/api/src/oncall/routes.ts
- apps/web/src/features/oncall/readiness-calendar.tsx
- specs/04-oncall.md (§4a.3, §4a.8)
- docs/DECISIONS/0032-the-technician-of-a-shift-travels-with-the-shift.md,
  docs/DECISIONS.md, PLAN.md (§8, §16)

interfaces:

- `oncallShiftSchema.technician` — `oncallMemberSchema` nullable, optional
- `GET /api/v1/oncall/shifts` answers `technician` for every shift of the range
- `ReadinessCalendar` names the technician of the shift it received and never
  asks for the members of a pool

## Task

**The comment of the office (out of band in phase 14).** „im Bereitschaftskalender
steh überall nicht besetzt dahinter … ausserdem bin ich admin und sehe immer noch
nicht wer … wann Bereitschaft hat".

The calendar named a technician over the members of the pool
(`GET /api/v1/oncall/pools/:id/members`). The technician of a shift need not be a
member of its pool — §4a.2 makes the pool the candidates of a swap, §4a.3 keeps
`user_id` a foreign key to `users` and the administration grid offers every active
user for a grouped pool. A shift of such a technician read „nicht besetzt" and an
admin could not read who has the readiness when.

1. `packages/shared/src/schemas/oncall.ts`: the display data of a person is one
   schema (`memberRow`) — a pool member and the technician of a shift.
   `oncallShiftSchema` gains the field `technician` (that shape, nullable,
   optional); `oncallMemberSchema` is that schema.
2. `apps/api/src/oncall/routes.ts`: the shift list answers the display data of
   `user_id` next to every shift of the range — one query for the distinct
   technicians of the range, the values drizzle-bound, `technician` is `null`
   while the slot is unstaffed. The guard of the route stays `oncall.read`.
3. `apps/web/src/features/oncall/readiness-calendar.tsx`: the row names the
   technician of the shift. The calendar asks for no pool member at all. A shift
   with a technician is never called „nicht besetzt": without a name in the answer
   the row reads `oncall.readiness.assigned`. The gate of WP-M14-131/132 stays:
   a role without `oncall.read_names` names nobody.
4. `specs/04-oncall.md` §4a.3 and §4a.8 name the field of the shift list,
   `PLAN.md` §8 names it in the readiness rules and ADR-0032 records the decision.
5. Tests: the calendar test names a technician whose pool has no members and
   reads „besetzt" for a technician without a name; the routes integration spec
   proves that the name of a technician who is no member of the pool travels with
   the shift and that an unstaffed slot answers `null`.

## Non-goals

- No migration: `user_id` already exists and the name is read from `users`.
- No change of the swap rules: the members of a pool are still the candidates of
  a swap and the swap form of the own readiness still reads them.
- No change of the iCal feed, of the warnings, of the administration grid and of
  the names of the assignees of a ticket (WP-M14-85).
- No new permission key: `oncall.read_names` (WP-M14-131) already gates the names.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
npm run test:e2e
```

Expected: all green; the calendar names the technician of every shift, the shift
list carries the technician and the shift list stays guarded by `oncall.read`.

## Handoff

- Files changed: the shared on-call contract, the shift list route, the calendar,
  the two web tests, the routes integration spec, `specs/04-oncall.md` §4a.3 and
  §4a.8, ADR-0032 and its index, `PLAN.md` §8 and §16, this document,
  `work-packages/README.md`, `CHANGELOG.md`, `docs/REPO-MAP.md`
- Interfaces added: `oncallShiftSchema.technician`, the technician of the shift
  list, `technicianName(shift)` in the calendar
- Verified: `npm run check` (typecheck, lint, vitest, i18n, wp-check, e2e)
- Follow-up WP: none
- Open question: none
