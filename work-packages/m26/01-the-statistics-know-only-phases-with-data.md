# WP-M26-01: the statistics know only phases with data

format: ctx-256k
status: done
depends-on: —
phase: 26
milestone: m26
context-budget: 48k tokens
spec: specs/12-stats.md §12.2; PLAN.md §13, §16 (phase 26); ADR-0049
spec-lines: 60
changed-lines: 520

files-read:

- specs/12-stats.md §12.2 (the phases of the reaction times)
- apps/api/src/tickets/workflow.ts (the columns the workflow writes)
- apps/api/src/stats/reaction-times.ts (the aggregate per phase)
- apps/api/src/stats/export.ts (the rows of the CSV export)
- packages/shared/src/schemas/stats.ts (the contract of the answer)
- apps/web/src/features/stats/stats-page.tsx (the page of the statistics)

files-write:

- specs/12-stats.md
- packages/shared/src/schemas/stats.ts
- apps/api/src/stats/reaction-times.ts
- apps/api/src/stats/export.ts
- apps/api/src/db/seed-stats-reference.ts
- apps/web/src/features/stats/stats-page.tsx
- apps/web/src/i18n/locales/de/stats.json, apps/web/src/i18n/locales/en/stats.json
- docs/DECISIONS/0049-the-statistics-name-the-readable-text-and-show-the-trends.md, docs/DECISIONS.md
- work-packages/m26/

interfaces:

- `GET /api/v1/stats/reaction-times` — the answer without the phase `firstResponse`
- `queryReactionTimes(database, filter, now?): Promise<ReactionTimes>` — two phases

## Task

The phase `firstResponse` measured the column `tickets.first_response_at`, and
no workflow event ever writes that column (`workflow.ts` writes
`review_started_at`, `accepted_at`, `acknowledged_at` and `closed_at`). The
phase answered a count of zero and empty durations (ADR-0049 decision 1).

1. **The spec** `specs/12-stats.md` §12.2 names the two phases `review` and
   `acknowledge` and states that a column without a writer is not a phase; the
   column stays in the database as an unused legacy column and is read nowhere.
2. **The contract** `packages/shared/src/schemas/stats.ts`: the answer of
   `GET /api/v1/stats/reaction-times` carries `review` and `acknowledge` only.
3. **The service** `apps/api/src/stats/reaction-times.ts` runs the aggregate
   over the two end columns; the export `apps/api/src/stats/export.ts` writes
   the rows of the two phases, and the reference seed
   `apps/api/src/db/seed-stats-reference.ts` writes no `first_response_at`.
4. **The page** `apps/web/src/features/stats/stats-page.tsx` shows the two
   phases; the locales `de/stats.json` and `en/stats.json` lose the key
   `reaction.phase.firstResponse`.
5. **The decision** `docs/DECISIONS/0049-*.md` records the three decisions of
   the phase (no phase without a data source, the readable text instead of the
   key, the trends answered by the API); the index `docs/DECISIONS.md` names it
   and marks ADR-0015 as amended.
6. **The tests**: the contract test of the shared schemas and the integration
   test of the reaction times are adjusted; the reference seed keeps its
   median of the review phase.

## Non-goals

- No change of the dashboard — the evaluation block of the snapshot loses its
  average in **WP-M26-02**.
- No new diagram and no new text of the statistics — **WP-M26-03** …
  **WP-M26-05**.
- No migration: the column stays.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the contract test of the reaction times fails before the
change and passes after it.

## Handoff

- Files changed: the spec of the statistics, the contract, the service, the
  export, the reference seed, the page, the two locales, the ADR and its
  index
- Interfaces added: none — the answer of the reaction times loses a field
- Verified: the commands above
- Follow-up WP: **WP-M26-02** (the dashboard loses the average of the same
  phase), **WP-M26-03** (the readable names), **WP-M26-04** (the trends),
  **WP-M26-05** (the axes and the ranking) — the files are in
  `work-packages/m26/`
- Open question: none
