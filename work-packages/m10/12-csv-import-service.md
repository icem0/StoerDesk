# WP-M10-12: CSV parsing, mapping and preview service

format: small-model
status: planned
depends-on: WP-M10-03
phase: 10
milestone: m10
context-budget: 18k tokens
spec: specs/08-objects-api.md §9.4
spec-lines: 100

files-read:

- specs/08-objects-api.md (§9.4)
- packages/shared/src/schemas/object.ts
- apps/api/src/objects/service.ts
- packages/shared/src/search.ts

files-write:

- packages/shared/src/schemas/object-import.ts
- apps/api/src/objects/import.ts
- packages/shared/src/schemas/index.ts

interfaces:

- `parseObjectCsv`, `previewObjectImport`, `applyObjectImport`
- `objectImportRequestSchema`, `objectImportPreviewSchema`

## Task

1. Implement a dependency-free CSV parser for comma/semicolon, UTF-8, quoted
   fields and the 2 MB / 5,000 row limits.
2. Map headers case-insensitively with the German aliases of §9.4; validate
   `objectNo` and `name` per row.
3. Compare mapped fields with the stored objects and return the preview summary.
4. Apply valid rows in one transaction with per-row errors and idempotent
   repeats.

## Non-goals

- No route (WP-M10-13).
- No UI (WP-M10-14).
- No import of `qrToken`, `externalId`, `externalType` or `active`.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; tests cover quoted fields, aliases, row errors, new/
changed/unchanged and an idempotent second import.

## Handoff

- Files changed: the CSV service and the shared contracts
- Interfaces added: the import service functions
- Verified: the commands above
- Follow-up WP: WP-M10-13, WP-M10-14
- Open question: none
