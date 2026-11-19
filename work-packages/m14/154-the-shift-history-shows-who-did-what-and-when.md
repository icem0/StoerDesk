# WP-M14-154: the shift history shows who did what and when

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 12k tokens
spec: specs/04-oncall.md §4a.3, §4a.4, §4a.5, §4a.8, §4a.10; PLAN.md §8
spec-lines: 40

depends-on: WP-M14-153

files-read:

- specs/04-oncall.md (§4a.3 shifts, §4a.4 confirm, §4a.5 swaps, §4a.8 routes)
- apps/api/src/db/schema.ts (`oncallEvents`)
- apps/web/src/features/oncall/readiness-calendar.tsx (the shift rows)
- apps/web/src/features/oncall/my-shifts-page.tsx (the own shift cards)
- work-packages/m14/153-the-milestones-of-the-ticket-view-are-buttons.md

files-write:

- specs/04-oncall.md (§4a.8, §4a.10)
- PLAN.md (§8, §16)
- work-packages/README.md
- CHANGELOG.md

interfaces:

- `GET /api/v1/oncall/shifts/:id/history` (`oncall.read`)
- `oncallShiftHistoryEntrySchema` — type, time, actor, referenced person,
  state transition and decline reason
- a shift detail dialog that opens from the readiness calendar and from an own
  shift

## Task

**The comment of the office (out of band in phase 14).** „zu jeder schicht sollte
es einen verlauf mit details geben wie: … erstellt am, von, abgelehnt, zugewiesen
von, an, angenommen von am usw … beim klick auf eine schicht sollten diese daten
sichtbar werden … auch wenn man am kalender auf die schicht klickt."

The append-only `oncall_events` trail already records every step (§4a.4,
§4a.5), but no route reads it and no view shows it. This package is the **spec
and the split** — no product code:

1. `specs/04-oncall.md` §4a.10 names the history route, its answer and the gate
   of `oncall.read_names`; §4a.8 gains the route row.
2. `PLAN.md` §8 names the shift history next to the readiness rules and §16
   records the chain and its split.
3. `work-packages/README.md` lists the parent and the two children.

The chain is split into **WP-M14-154a** (the history contract, the service and
the route) and **WP-M14-154b** (the detail dialog and the two click targets).

## Non-goals

- No new table and no migration: the events exist and are append-only.
- No raw payload in the answer: the route answers the named fields only.
- No translation of a person name or of a pool name: both are installation data
  (§3.1).
- No change of the write path: every action already writes its event.

## Acceptance

```bash
npm run wp:check
npm run i18n:check
```

Expected: both green; the spec section and the three WP documents exist.

## Handoff

- Files changed: `specs/04-oncall.md`, `PLAN.md` §8 and §16,
  `work-packages/README.md`, `CHANGELOG.md`, the three WP files
- Interfaces added: the history route and the dialog contract of §4a.10
- Verified: `npm run wp:check` and `npm run i18n:check`
- Follow-up WP: WP-M14-154a, WP-M14-154b — both files are created in this commit
- Open question: none
