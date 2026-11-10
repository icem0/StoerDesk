# WP-M10-20b: fault catalog management screen keeps its alphabetical order

format: small-model
status: done
depends-on: WP-M10-20, WP-M2-40c
phase: 10
milestone: m10
context-budget: 12k tokens
spec: specs/06-report-form.md §7.9
spec-lines: 20

files-read:

- apps/web/src/admin/text-templates-page.tsx (the management table and `useTextTemplates`)
- apps/api/src/settings/text-templates.ts (the endpoint is now frequency-ordered, WP-M10-20)
- apps/web/src/admin/__tests__/deadlines-page.test.tsx (the fetch-stub test pattern)
- apps/web/src/routes/index.tsx (the `/admin/text-templates` route)

files-write:

- apps/web/src/admin/text-templates-page.tsx
- apps/web/src/admin/__tests__/text-templates-page.test.tsx

interfaces:

- `alphabeticalTemplates(templates): TextTemplateSummary[]` — client sort of the management table

## Task

1. The catalog endpoint now answers frequency-ordered for the report and office forms
   (WP-M10-20). The management screen must keep the predictable alphabetical key
   order, so add `alphabeticalTemplates` and map the table rows through it.
2. The create, edit and delete flows are untouched: they address a row by its `id`,
   which does not depend on the row order.
3. Add the fetch-stub test: the stub returns `z_frequent` before `a_rare`; the
   rendered `<td>` key cells must read `a_rare`, then `z_frequent` — the sort.

## Non-goals

- No endpoint change and no server change (the ordering already exists, WP-M10-20).
- No dashboard change (WP-M10-21).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new page test fails against the un-sorted table and passes after.

## Handoff

- Files changed: the management page and its new page test
- Interfaces added: `alphabeticalTemplates`
- Verified: typecheck, lint, test:run, wp:check
- Follow-up WP: none
- Open question: none
