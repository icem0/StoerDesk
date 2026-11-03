# WP-M2-42: bootstrap the standard fault types on the API start

format: small-model
status: done
depends-on: WP-M2-41
phase: 2
context-budget: 12k tokens
spec: specs/02-data-model.md §4.5 (bootstrap rule)
spec-lines: 25

files-read:

- specs/02-data-model.md §4.5
- apps/api/src/db/seed-base.ts — the idempotent bootstrap style
- apps/api/src/db/seed-demo.ts — the existing template insert
- apps/api/src/index.ts — the direct start of the API
- apps/api/src/db/schema.ts — `settings`, `textTemplates`

files-write:

- apps/api/src/db/seed-standard-texts.ts
- apps/api/src/index.ts
- apps/api/src/db/__tests__/seedStandardTexts.integration.spec.ts

interfaces:

- `seedStandardTexts(database)` — inserts the eight standard types with their
  `de`/`en` row the first time and marks the run in `settings` under
  `standard_texts_bootstrap`; a later run changes nothing
- `STANDARD_TEXTS_BOOTSTRAP_KEY` — the settings key of the marker

## Task

1. Add the idempotent bootstrap seed: templates and translations are inserted
   with `ON CONFLICT DO NOTHING`, the marker row makes the run happen once.
2. Call it on the direct API start after the RBAC and administrator seeds.
3. Integration test: the first run inserts 8 templates and 16 translations, the
   second run is a no-op and a deleted standard type stays deleted.

## Non-goals

- No migration and no new column (WP-M2-40).
- No change of the demo seed, which writes the same texts and stays compatible.
- No per-installation configuration of the bootstrap list.

## Acceptance

```bash
npx vitest run apps/api/src/db/__tests__/seedStandardTexts.integration.spec.ts
npm run typecheck --workspaces --if-present
npm run lint
npm run wp:check
```

Expected: all green; the integration spec really runs against the database.

## Handoff

- Files changed: the seed, the start of the API and the test
- Interfaces added: `seedStandardTexts`, `STANDARD_TEXTS_BOOTSTRAP_KEY`
- Verified: `npx vitest run` (4 integration tests green)
- Follow-up WP: none
- Open question: none
