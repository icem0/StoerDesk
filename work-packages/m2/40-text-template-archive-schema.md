# WP-M2-40: fault template archive schema and shared contracts

format: small-model
status: done
depends-on: WP-M2-00
phase: 2
context-budget: 10k tokens
spec: specs/02-data-model.md §4.5 (template lifecycle), specs/06-report-form.md §7.9
spec-lines: 45

files-read:

- specs/02-data-model.md §4.5
- specs/06-report-form.md §7.9
- apps/api/src/db/schema.ts — `textTemplates`, `index`, `timestampOptions`
- apps/api/src/db/migrations/0007_bma_sync_runs.sql — generated-migration style

files-write:

- apps/api/src/db/schema.ts
- apps/api/src/db/migrations/0008_text_template_archive.sql
- packages/shared/src/schemas/index.ts
- packages/shared/src/schemas/text-template.ts

interfaces:

- `textTemplates.archivedAt` — nullable `timestamptz`, index `text_templates_archived_at_idx`
- shared schemas: `textTemplateKeySchema`, `textTemplateTranslationsSchema`,
  `textTemplateSummarySchema`, `textTemplateListResponseSchema`,
  `createTextTemplateRequestSchema`, `updateTextTemplateRequestSchema`,
  `publicTextTemplateSummarySchema`, `publicTextTemplateListResponseSchema`,
  `publicTextTemplateQuerySchema` and their inferred types

## Task

1. Add `archivedAt` (`archived_at`, nullable, `timestampOptions`) and the index to
   the existing `textTemplates` table. No new table, no change to the translation
   table.
2. Generate migration `0008_text_template_archive.sql` with `db:generate`; rename
   the generated file and the journal tag to the descriptive name. The meta
   snapshot is generated, never hand-edited.
3. Add the shared request/response schemas of §7.9. The public list carries only
   `{ key, text }`; the admin summary carries both translations and `usageCount`.

## Non-goals

- No route and no query code (WP-M2-40b).
- No admin page (WP-M2-40c/40d) and no form change (WP-M2-40e/40f).
- No change to the seed: the nine standard texts stay unarchived.

## Acceptance

```bash
npm run db:generate -w @stoerdesk/api
npm run typecheck --workspaces --if-present
npm run lint
npm run wp:check
```

Expected: all green; the migration adds the nullable column and the index.

## Handoff

- Files changed: schema, migration, meta snapshot, shared schema file, WP docs
- Interfaces added: `archivedAt`, the text-template schemas listed above
- Verified: `npm run db:generate` produced `0008_text_template_archive`, `npm run typecheck` green
- Follow-up WP: WP-M2-40b (the API)
- Open question: none
