# WP-M34-01: The shift that has not started is released by the admin

format: ctx-256k
status: done
depends-on: WP-M33-01
phase: 34
context-budget: 52k tokens
spec: specs/04-oncall.md §4a.3, PLAN.md §8, PLAN.md §16
spec-lines: 180
changed-lines: 320

files-read:

- PLAN.md (§8, §16, §17)
- specs/04-oncall.md (§4a.3)
- docs/DECISIONS/0047-a-shift-that-was-never-confirmed-can-be-deleted.md
- apps/api/src/oncall/service.ts
- apps/web/src/features/oncall/shift-admin-actions.tsx
- apps/web/src/features/oncall/planning-section.tsx
- apps/web/src/i18n/locales/de/oncall.json
- apps/api/src/oncall/__tests__/service.integration.spec.ts

files-write:

- specs/04-oncall.md
- docs/DECISIONS/0058-a-shift-that-has-not-started-is-released-by-the-admin.md
- docs/DECISIONS.md
- PLAN.md
- apps/api/src/oncall/service.ts
- apps/web/src/features/oncall/shift-admin-actions.tsx
- apps/web/src/features/oncall/planning-section.tsx
- apps/web/src/i18n/locales/de/oncall.json
- apps/web/src/i18n/locales/en/oncall.json

interfaces:

- `deleteShift(database, shiftId, actorUserId): Promise<void>` — the locks of ADR-0047 apply to a shift that started
- `409 oncall_shift_locked` — the reason `state`, `confirmed` or `started` (ADR-0058)

## Task

1. **The decision (ADR-0058).** A shift that **has not started** is released by
   the delete: every state is deletable while `starts_at` lies in the future —
   `UNFILLED`, `DRAFT`, `PLANNED`, `DECLINED`, `CONFIRMED`, `SWAP_REQUESTED`.
   The duty of a shift of the future was never held, so no history is lost. A
   shift that started keeps the rule of ADR-0047. The ADR is written in
   `docs/DECISIONS/0058-…md` and listed in `docs/DECISIONS.md`.
2. **The spec.** `specs/04-oncall.md` §4a.3 names the two cases: the shift of
   the future and the shift that started; the index note and the table of the
   routes follow.
3. **The plan.** `PLAN.md` §8 carries the rule of the release, §16 the phase 34
   and its status.
4. **The service.** `deleteShift` checks `started = shift.startsAt <= now` and
   applies the three locks of ADR-0047 only to a shift that started. The reason
   of a lock stays `state`, `confirmed` or `started`.
5. **The interface.** The button „Löschen" of the actions of the shift and of
   the weekly plan is offered for a shift that has not started — also a
   confirmed one. A shift that started keeps the disabled button with the
   title that names the reason. The texts of `de/oncall.json` and
   `en/oncall.json` name the new rule.
6. **The tests.** The integration test of the service proves that a confirmed
   shift of the future is deleted and that a confirmed shift that started
   answers `409 oncall_shift_locked` with the reason `state`. The test of the
   web proves that the delete of a confirmed shift of the future is offered
   and that a confirmed shift that started keeps the disabled button.

## Non-goals

- No notification of the technician whose shift was released — that is
  WP-M34-02.
- No new state `CANCELLED` and no place for it in the coupling, the iCal feed
  or the statistics.
- No change of the handover of a confirmed shift (WP-M23-10).

## Acceptance

Run and report the exact commands:

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected result: all green; the new tests fail before the change and pass
after it.

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: WP-M34-02 — the technician who had the shift learns that his
  duty is gone (the event `oncall.released` for the delete of a confirmed
  shift and for the handover of a confirmed shift).
- Open question: none
