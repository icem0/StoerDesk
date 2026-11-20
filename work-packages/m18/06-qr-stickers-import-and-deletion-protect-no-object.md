# WP-M18-06: QR, stickers, import and deletion protect „Ohne Objekt"

format: small-model
status: done
depends-on: WP-M18-05
phase: 18
milestone: m18
context-budget: 16k tokens
spec: ADR-0042; specs/08-objects-api.md §9.3; specs/02-data-model.md §4.3.3
spec-lines: 25

files-read:

- docs/DECISIONS/0042-a-ticket-without-an-object-is-possible.md (ADR-0042)
- apps/api/src/objects/import.ts (CSV import planning)
- apps/api/src/objects/service.ts (deletion, list)
- apps/web/src/features/objects/sticker-page.tsx (sticker selection)

files-write:

- apps/api/src/objects/import.ts (reserved row skipped)
- apps/web/src/features/objects/sticker-page.tsx (reserved row not printable)
- CHANGELOG.md, work-packages/README.md, this document

interfaces:

- `POST /api/v1/objects/import` skips a row whose `object_no` is `OHNE-OBJEKT` (neither new, changed nor error — it is not part of the import).
- The sticker sheet never offers „Ohne Objekt" for printing (it has no QR token).
- `DELETE /api/v1/objects/OHNE-OBJEKT` answers `422 object_reserved` (WP-M18-05).

## Task

1. apps/api/src/objects/import.ts — `planRows` skips a row whose object number
   (case-insensitively) is `OHNE-OBJEKT` (constant
   `WITHOUT_OBJECT_OBJECT_NO` from `apps/api/src/db/schema.ts`); neither new,
   changed nor error, it simply does not appear in the preview.
2. apps/web/src/features/objects/sticker-page.tsx — `visible` excludes objects
   with `pinned: true`, so the reserved object can neither be selected nor
   printed (it has no QR token anyway).
3. CHANGELOG.md ### Added and work-packages/README.md: WP-M18-06 becomes `done`.

## Non-goals

- The object edit page (the reserved row stays editable like data; only
  deletion is refused, decided in WP-M18-05).
- BMA sync — external objects never carry `OHNE-OBJEKT`; no change needed.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: typecheck, lint and wp-check green; vitest passes for everything
that does not need the dev database (its integration suites are unverifiable
here, see WP-M18-03).

## Handoff

- Files changed: apps/api/src/objects/import.ts,
  apps/web/src/features/objects/sticker-page.tsx, CHANGELOG.md,
  work-packages/README.md, this document
- Interfaces added: none new (existing import preview and sticker selection
  just exclude the reserved object number)
- Follow-up WP: WP-M18-07 (statistics count tickets without an object)
- Open question: none
