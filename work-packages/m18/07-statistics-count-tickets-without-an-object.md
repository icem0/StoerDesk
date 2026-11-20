# WP-M18-07: statistics count tickets without an object

format: small-model
status: done
depends-on: WP-M18-06
phase: 18
milestone: m18
context-budget: 16k tokens
spec: ADR-0042; specs/12-stats.md §12.1, §12.4; PLAN.md §13
spec-lines: 25

files-read:

- docs/DECISIONS/0042-a-ticket-without-an-object-is-possible.md (ADR-0042)
- packages/shared/src/schemas/stats.ts (stats filter contract)
- apps/api/src/stats/objects.ts (dimension predicates and top objects)
- apps/api/src/stats/filters.ts (stats range and conditions)
- specs/12-stats.md §12.1 (filters), §12.4 (top objects)

files-write:

- packages/shared/src/schemas/stats.ts
- apps/api/src/stats/objects.ts
- specs/12-stats.md (§12.1 `withoutObject`, §12.4 top objects show the reserved row)
- CHANGELOG.md, work-packages/README.md, this document

interfaces:

- `statsFilterSchema.withoutObject?: boolean` — `true` keeps only tickets without an object
  (the reserved object `OHNE-OBJEKT`), `false` keeps only tickets with an object,
  `undefined` keeps both.
- `GET /api/v1/stats/*` answers the filter like every other dimension; the
  top-objects list keeps showing the reserved row with its count.

## Task

1. packages/shared/src/schemas/stats.ts — `withoutObject: z.boolean().optional()`
   on `statsFilterSchema`.
2. apps/api/src/stats/objects.ts — `dimensionConditions` adds
   `"object_id" = <reserved id>` for `withoutObject: true` and
   `"object_id" <> <reserved id>` for `withoutObject: false` over `stats_tickets`
   (`specs/12-stats.md` §12.1).
3. specs/12-stats.md §12.1 documents `withoutObject`; §12.4 notes that the
   top-objects list keeps showing the reserved object with its count (the office
   sees there how many tickets of customers without a contract arrived).
4. CHANGELOG.md ### Added and work-packages/README.md: WP-M18-07 becomes `done`.

## Non-goals

- A new `byForeignObject` frequency grouping — the `objectNo` filter on
  `OHNE-OBJEKT` and the top-objects row already answer the question (ADR-0042).
- A `contracts_refs` / „Vertrag" notion (deferred by ADR-0008).

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

- Files changed: packages/shared/src/schemas/stats.ts,
  apps/api/src/stats/objects.ts, specs/12-stats.md, CHANGELOG.md,
  work-packages/README.md, this document
- Interfaces added: `withoutObject` on `StatsFilter`
- Follow-up WP: WP-M18-08 (tests: API integration without object → priority low,
  web picker and detail view)
- Open question: none
