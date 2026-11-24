# WP-M23-05: the admin deletes a shift that was never confirmed

format: small-model
status: done
depends-on: WP-M23-04
phase: 23
milestone: m23
context-budget: 20k tokens
spec: specs/04-oncall.md §4a.3
spec-lines: 30

files-read:

- apps/api/src/oncall/service.ts (the service of the shifts)
- apps/api/src/oncall/__tests__/service.integration.spec.ts (the test of the service)
- specs/04-oncall.md §4a.3 (the transitions of a shift)
- docs/DECISIONS/0044-consecutive-days-form-one-duty-block.md (the form of an ADR)

files-write:

- apps/api/src/oncall/service.ts
- apps/api/src/oncall/__tests__/service.integration.spec.ts
- specs/04-oncall.md, docs/DECISIONS/0047-a-shift-that-was-never-confirmed-can-be-deleted.md
- docs/DECISIONS.md, PLAN.md, work-packages/README.md, CHANGELOG.md

interfaces:

- `deleteShift(database, shiftId, actorUserId)` — deletes a shift; a shift that
  was never confirmed may be deleted even after it started, a shift that held
  the duty stays locked with `409 oncall_shift_locked`
- `oncall_shift_locked` — the reason of the lock travels in the params:
  `state` for a confirmed or swapped shift, `confirmed` for a shift that held
  the duty, `started` for a shift that was published and started

## Task

1. `deleteShift` refuses today every shift that started
   (`apps/api/src/oncall/service.ts:412`), so the admin cannot remove a shift
   that nobody ever accepted — the case the office meets: a shift was offered,
   nobody took it, and the slot stays in the plan for ever.
2. The new rule: a shift may be deleted after it started when it was never
   confirmed. The states `UNFILLED`, `DRAFT` and `DECLINED` are deletable; a
   shift that was confirmed at some moment keeps the lock, also when it was
   declined afterwards (`confirmed_at` is set then) — the duty it held stays
   part of the history.
3. The lock of a `PLANNED` shift that started stays: such a shift counted for
   the ticket coupling (§4a.6), so the office may have offered a ticket on it.
   The reason of the lock travels in the params of `oncall_shift_locked`.
4. The rule is named in `specs/04-oncall.md` §4a.3 and in ADR-0047.

## Non-goals

- No change of the confirmation, of the decline and of the swap.
- No new permission key — `oncall.admin` stays as it is.
- No change of the events of a deleted shift: they go with it, as they do
  today for every deleted shift.
- No change of the interface: the button of the web that disables the delete
  of a started shift and the texts of the refusal follow in WP-M23-06.

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

- Files changed: the service of the shifts, its test, the spec of the
  readiness, the ADR and the bookkeeping
- Interfaces added: none — the rule of `deleteShift` changed
- Verified: the commands above
- Follow-up WP: WP-M23-06 (the interface of the delete), WP-M23-07, WP-M23-08
- Open question: none
