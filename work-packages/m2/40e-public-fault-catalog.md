# WP-M2-40e: the public report form reads the live fault catalog

format: small-model
status: done
depends-on: WP-M2-40b
phase: 2
context-budget: 14k tokens
spec: specs/06-report-form.md §7.9
spec-lines: 35

files-read:

- specs/06-report-form.md §7.9
- apps/web/src/features/tickets/report-form-page.tsx — the chip list and the fallback
- apps/web/src/features/tickets/__tests__/report-form-page.test.tsx — the API stub
- packages/shared/src/seed/standard-texts.ts — the offline fallback list

files-write:

- apps/web/src/features/tickets/use-fault-catalog.ts
- apps/web/src/features/tickets/report-form-page.tsx
- apps/web/src/features/tickets/__tests__/report-form-page.test.tsx

interfaces:

- `usePublicFaultCatalog(locale)` — active templates of
  `GET /v1/public/text-templates?locale=`, with the bundled seed list as the
  fallback of a failed request (the offline form keeps working)
- `useFaultCatalog(locale)` — the administration list including archived
  templates, used by WP-M2-40f
- `FaultCatalogEntry` — `{ key, text, archived }`

## Task

1. Add the catalog hooks. A successful answer wins — also when it is empty, so
   an admin may archive every template. Only a failed request falls back to the
   seed list.
2. The public report form renders the chips of the server catalog instead of the
   compile-time `STANDARD_TEXT_KEYS`.
3. The unit test answers the catalog endpoint and asserts that an invalid token
   still sends no report.

## Non-goals

- No internal form and no ticket detail (WP-M2-40f).
- No offline cache of the catalog: the fallback list is enough.

## Acceptance

```bash
npx vitest run apps/web/src/features/tickets/__tests__/report-form-page.test.tsx
npm run typecheck --workspaces --if-present
npm run lint
npm run wp:check
```

Expected: all green; the form shows the chips of the answer of the API.

## Handoff

- Files changed: the hook, the report form and its test
- Interfaces added: the two catalog hooks
- Verified: `npx vitest run` (11 report-form tests green)
- Follow-up WP: WP-M2-40f (internal forms and ticket detail)
- Open question: none
