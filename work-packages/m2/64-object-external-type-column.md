# WP-M2-64: the objects table carries the external system type

format: small-model
status: implemented
depends-on: WP-M2-01, WP-M2-35
phase: 2
context-budget: 14k tokens
spec: specs/17-bmacloud-sync.md §17.3 (new column, filled by WP-M2-65),
specs/02-data-model.md §4.3 (object list)
spec-lines: 40

files-read:

- apps/api/src/db/schema.ts — `objects` (WP-M2-00)
- apps/api/src/objects/service.ts — `summarize` spreads the row into the summary (WP-M2-01)
- packages/shared/src/schemas/object.ts — `objectSummarySchema` (WP-M2-01)
- apps/api/src/objects/__tests__/objects.integration.spec.ts — the API contract tests

files-write:

- apps/api/src/db/schema.ts — `externalType: text('external_type')` on `objects`
- apps/api/src/db/migrations/0010_object_external_type.sql (+ drizzle-kit meta)
- packages/shared/src/schemas/object.ts — `externalType` in `objectSummarySchema`
- apps/{api/src/objects/__tests__/objects.integration.spec.ts,
  web/src/features/objects/__tests__/{object-list-page,sticker-page}.test.tsx} — the new
  field in the API contract and the `externalType` key in the two web fixtures

interfaces:

- `objects.external_type` — nullable text; the human-readable system type name of an
  externally maintained object (BMAcloud Anlagentyp); locally created objects keep `null`
- every object answer of the API (`objectSummarySchema`) carries `externalType: string | null`
- the field is read-only: `createObjectRequestSchema` and `updateObjectRequestSchema`
  do not accept it

## Task

1. Add the nullable `external_type` text column to `objects` in the Drizzle schema and
   generate the migration with `npm run db:generate -w <api workspace>`; never hand-write
   the migration meta.
2. Add `externalType: z.string().nullable()` to `objectSummarySchema`; the service
   `summarize` already spreads the full row, so API list, single GET and PATCH answers
   carry the field without further code.
3. Do not accept the field in create/update inputs; an unknown key in the body stays ignored.
4. Extend the objects integration test: a created object answers `externalType: null`;
   patching `notes` keeps it `null`. Add `externalType: null` to the `ObjectSummary`
   fixtures of the two web object tests, otherwise the web typecheck breaks.

## Non-goals

- No BMAcloud sync write into the column (WP-M2-65 fills it).
- No category classification `BMA`/`RWA`/… (WP-M2-65) and no UI column (WP-M2-66).
- No seeding of `systems` from BMAcloud (`specs/17-bmacloud-sync.md` §17.7 stays).

## Acceptance

```bash
npm run check
```

Expected: typecheck, lint, tests, i18n:check, wp:check green (e2e reported as
skipped when this container has no browser).

## Handoff

- Files changed: schema, migration 0010 + meta, shared object schema, integration test,
  the WP documents and the repository bookkeeping.
- Interfaces added: `objects.external_type`, `objectSummarySchema.externalType`.
- Verified: `npm run check` green; migration applied by the integration test database.
- Follow-up WP: WP-M2-65 (the contract), WP-M2-65b (`65b-bma-sync-external-type-write.md`,
  created with this rewrite) writes the column, and WP-M2-66 (the list column) — all
  four documents are part of this commit.
- Open question: none.
