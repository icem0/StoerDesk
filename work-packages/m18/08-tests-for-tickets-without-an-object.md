# WP-M18-08: tests for tickets without an object

format: small-model
status: done
depends-on: WP-M18-07
phase: 18
milestone: m18
context-budget: 20k tokens
spec: ADR-0042; PLAN.md §7 rule 1; specs/02-data-model.md §4.3.3
spec-lines: 20

files-read:

- docs/DECISIONS/0042-a-ticket-without-an-object-is-possible.md (ADR-0042)
- apps/api/src/tickets/__tests__/internal-title.integration.spec.ts (the pattern of an internal create integration spec)
- apps/web/src/features/tickets/__tests__/internal-create-page.test.tsx (the web form tests)
- apps/api/src/db/schema.ts (WITHOUT_OBJECT_OBJECT_ID)

files-write:

- apps/api/src/tickets/__tests__/internal-without-object.integration.spec.ts
- apps/web/src/features/tickets/__tests__/internal-create-page.test.tsx
- CHANGELOG.md, work-packages/README.md, this document

interfaces:

- `internal-without-object.integration.spec.ts`: create via the reserved object → priority `low`, `object_info_text` stored, counted by `withoutObject: true` in the statistics.
- `internal-create-page.test.tsx`: the picker lists „Ohne Objekt" last; choosing it shows the info field and submits `objectInfo`.

## Task

1. apps/api/src/tickets/__tests__/internal-without-object.integration.spec.ts — create
   through `createInternalTicket` with the reserved object id: priority `low`
   (the object's deviation, ADR-0029), `object_info_text` stored, counted by the
   statistics filter `withoutObject: true` and excluded by `withoutObject: false`.
2. apps/web/src/features/tickets/__tests__/internal-create-page.test.tsx — the
   picker lists the reserved entry last; choosing it shows the object info field
   and the create request carries `objectId` of the reserved object plus
   `objectInfo`.
3. CHANGELOG.md ### Added and work-packages/README.md: WP-M18-08 becomes `done`.

## Non-goals

- E2E through the browser (Playwright) — needs a running instance; the
  integration tests skip without a database here (see WP-M18-03).

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

- Files changed: apps/api/src/tickets/__tests__/internal-without-object.integration.spec.ts,
  apps/web/src/features/tickets/__tests__/internal-create-page.test.tsx,
  CHANGELOG.md, work-packages/README.md, this document
- Interfaces added: none (tests only)
- Follow-up WP: none — phase 18 chain complete
- Open question: none
