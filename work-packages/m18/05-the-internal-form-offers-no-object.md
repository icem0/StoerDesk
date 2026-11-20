# WP-M18-05: the internal form offers „Ohne Objekt" and the object info field

format: small-model
status: done
depends-on: WP-M18-04
phase: 18
milestone: m18
context-budget: 22k tokens
spec: ADR-0042; PLAN.md §7 rule 1; specs/02-data-model.md §4.3.3
spec-lines: 35

files-read:

- docs/DECISIONS/0042-a-ticket-without-an-object-is-possible.md (ADR-0042)
- apps/api/src/objects/service.ts (object list API and deletion)
- apps/api/src/db/schema.ts (WITHOUT_OBJECT_OBJECT_NO)
- apps/web/src/features/tickets/internal-create-page.tsx (the picker and the form)
- apps/web/src/features/tickets/ticket-detail-page.tsx (the object table of the view)
- apps/web/src/i18n/locales/de/ticket.json, en (the German and English texts)

files-write:

- apps/api/src/objects/service.ts (pinned sort, deletion refused)
- apps/web/src/features/tickets/internal-create-page.tsx
- apps/web/src/features/tickets/ticket-detail-page.tsx
- CHANGELOG.md, work-packages/README.md, apps/web/src/i18n/locales/{de,en}/ticket.json, this document

interfaces:

- `GET /api/v1/objects` rows carry `pinned: true` for the reserved object and are sorted pinned last.
- `DELETE /api/v1/objects/:objectNo` answers `422 object_reserved` for `OHNE-OBJEKT`.
- The internal picker shows the reserved entry last under `internal.create.fields.objectNone`; choosing it shows the text field `internal.create.fields.objectInfo`.
- The ticket view shows `detail.field.objectInfo` when `object_info_text` is set.

## Task

1. apps/api/src/objects/service.ts — `listObjects` marks `pinned: true` on the row
   whose `object_no` is `OHNE-OBJEKT` (constant `WITHOUT_OBJECT_OBJECT_NO` from
   the schema) and sorts pinned rows last, then by object number;
   `softDeleteObject` refuses the reserved object with `422 object_reserved`.
2. apps/web/src/features/tickets/internal-create-page.tsx — the picker appends
   the pinned entry as its last choice (label `internal.create.fields.objectNone`);
   choosing it shows a textarea `objectInfo` (label `internal.create.fields.objectInfo`,
   hint `internal.create.fields.objectInfoHint`); the submit payload carries
   `objectInfo` only for that choice.
3. apps/web/src/features/tickets/ticket-detail-page.tsx — below the object table,
   a row `detail.field.objectInfo` with `objectInfoText` when set.
4. apps/web/src/i18n/locales/{de,en}/ticket.json — the five new keys, identical in
   both locales (i18n:check).
5. CHANGELOG.md ### Added and work-packages/README.md: WP-M18-05 becomes `done`.

## Non-goals

- The object edit page still shows the reserved row like any other object (its
  name and number are data); only deletion is refused — WP-M18-06 keeps import
  and stickers away from it.
- Re-assigning such a ticket later to a real object — not in this phase.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: typecheck, lint and wp-check green; vitest passes for everything that
does not need the dev database (its integration suites are unverifiable here,
see WP-M18-03).

## Handoff

- Files changed: apps/api/src/objects/service.ts,
  apps/web/src/features/tickets/internal-create-page.tsx,
  apps/web/src/features/tickets/ticket-detail-page.tsx,
  apps/web/src/i18n/locales/de/ticket.json,
  apps/web/src/i18n/locales/en/ticket.json, CHANGELOG.md,
  work-packages/README.md, this document
- Interfaces added: `pinned` on object rows, `objectInfo` in the create payload,
  `objectInfoText` on the detail view
- Follow-up WP: WP-M18-06 (QR, stickers, import and deletion protect „Ohne Objekt")
- Open question: none
