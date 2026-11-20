# WP-M18-03: the object „Ohne Objekt" and the field `object_info_text`

format: small-model
status: done
depends-on: WP-M18-02
phase: 18
milestone: m18
context-budget: 20k tokens
spec: PLAN.md §6; docs/DECISIONS/0042-a-ticket-without-an-object-is-possible.md; specs/02-data-model.md §4.3.3, §4.8
spec-lines: 70

files-read:

- docs/DECISIONS/0042-a-ticket-without-an-object-is-possible.md (ADR-0042)
- apps/api/src/db/migrations/0050_object_priority_overrides.sql (style of a hand-written migration)
- apps/api/src/db/schema.ts (tables `objects`, `object_priority_overrides`, `tickets`)
- specs/02-data-model.md §4.3.3 (the reserved object), §4.8 (the tickets row)

files-write:

- apps/api/src/db/migrations/0054_ticket_without_object.sql
- apps/api/src/db/schema.ts (column `object_info_text` of `tickets`, the constants of the reserved object)
- CHANGELOG.md, work-packages/README.md, this document (the row of WP-M18-03 becomes done)

interfaces:

- migration `0054_ticket_without_object.sql`: seeds the reserved object row (`OHNE-OBJEKT`, fixed UUID, active, no QR token), its priority override `low` (`object_priority_overrides`), and adds `tickets.object_info_text text`.
- `WITHOUT_OBJECT_OBJECT_ID` / `WITHOUT_OBJECT_OBJECT_NO` — exported constants of the reserved object.

## Task

1. apps/api/src/db/migrations/0054_ticket_without_object.sql — `INSERT INTO objects` the reserved row with `ON CONFLICT DO NOTHING`, `INSERT INTO object_priority_overrides` priority `low` with `ON CONFLICT DO UPDATE`, `ALTER TABLE tickets ADD COLUMN object_info_text text`.
2. apps/api/src/db/schema.ts — `tickets.objectInfoText: text('object_info_text')` nullable and the two exported constants of the reserved object; the comment of `objectId` names the reserved row.
3. CHANGELOG.md ### Added and work-packages/README.md: WP-M18-03 becomes `done`.

## Non-goals

- No nullable `object_id` — the foreign key stays `NOT NULL`.
- No API, no UI, no statistics — they follow in WP-M18-04 … WP-M18-07.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the migration applies on an empty database and on a database that already carries phase 18's preceding state.

## Handoff

- Files changed: apps/api/src/db/migrations/0054_ticket_without_object.sql, apps/api/src/db/schema.ts, CHANGELOG.md, work-packages/README.md, this document
- Interfaces added: `WITHOUT_OBJECT_OBJECT_ID`, `WITHOUT_OBJECT_OBJECT_NO`, `tickets.object_info_text`
- Follow-up WP: WP-M18-04 (the API stores the field and pins the row)
- Open question: none
