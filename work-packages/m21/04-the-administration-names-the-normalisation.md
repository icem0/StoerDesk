# WP-M21-04: the administration names the normalisation

format: small-model
status: planned
depends-on: WP-M21-03
phase: 21
milestone: m21
context-budget: 13k tokens
spec: specs/04-oncall.md §4a.3.4
spec-lines: 30

files-read:

- apps/web/src/admin/oncall-page.tsx (the plan form of the pool)
- apps/web/src/i18n/locales/de/oncall.json (the texts of the plan)
- apps/web/src/i18n/locales/en/oncall.json (the texts of the plan)
- apps/web/src/admin/__tests__/oncall-page.test.tsx (the test of the plan)

files-write:

- apps/web/src/admin/oncall-page.tsx
- apps/web/src/i18n/locales/de/oncall.json
- apps/web/src/i18n/locales/en/oncall.json
- apps/web/src/admin/__tests__/oncall-page.test.tsx

interfaces:

- `admin.schedule.normalised` (de/en) — the hint that consecutive days with
  the same duty window form one block

## Task

1. Add the hint to the plan form of the pool: consecutive days with the same
   duty window form one block, so the plan of the pool shows the blocks.
2. Write the texts in de and en.
3. Test: the plan form shows the hint and the blocks of the pool.

## Non-goals

- No change of the plan form itself (the blocks, the presets and the save stay).
- No new button; the normalisation happens in the API.
- No change of the shift grid.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new test fails before the change and passes after it.

## Handoff

- Files changed: the plan form, the two locales and the test
- Interfaces added: the text of the hint
- Verified: the commands above
- Follow-up WP: none — phase 21 is closed
- Open question: none
