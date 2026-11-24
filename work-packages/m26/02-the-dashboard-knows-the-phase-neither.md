# WP-M26-02: the dashboard knows the phase neither

format: ctx-256k
status: done
depends-on: WP-M26-01
phase: 26
milestone: m26
context-budget: 40k tokens
spec: specs/11-dashboard.md §11.4a; PLAN.md §13; ADR-0049 (decision 1), ADR-0015
spec-lines: 40
changed-lines: 260

files-read:

- specs/11-dashboard.md §11.2, §11.4a (the block of the evaluations)
- packages/shared/src/schemas/dashboard.ts (the contract of the snapshot)
- apps/api/src/dashboard/service.ts (`resolveDashboardEvaluations`)
- apps/web/src/features/dashboard/display.tsx (the block of the evaluations)
- apps/web/src/i18n/locales/de/ticket.json (the texts of the dashboard)

files-write:

- specs/11-dashboard.md
- packages/shared/src/schemas/dashboard.ts
- apps/api/src/dashboard/service.ts
- apps/web/src/features/dashboard/display.tsx
- apps/web/src/i18n/locales/de/ticket.json, apps/web/src/i18n/locales/en/ticket.json

interfaces:

- `GET /api/v1/dashboard/snapshot` — the evaluation block without `averageFirstResponseMinutes`
- `resolveDashboardEvaluations(database, now): Promise<DashboardEvaluations>`

## Task

The dashboard showed the average of the phase that never had data as „Ø Zeit
bis Rückmeldung" (ADR-0049 decision 1, ADR-0015 amended).

1. **The spec** `specs/11-dashboard.md` §11.4a names the three averages of the
   block — review, acknowledge and processing — and states that a phase
   without a data source is not an average.
2. **The contract** `packages/shared/src/schemas/dashboard.ts` drops
   `averageFirstResponseMinutes` from the evaluation block; the block stays
   optional, so an older frame of the event stream still parses.
3. **The service** `apps/api/src/dashboard/service.ts` calculates the three
   averages — the SQL loses the column `first_response_at`.
4. **The display** `apps/web/src/features/dashboard/display.tsx` renders three
   rows instead of four; the locales `de/ticket.json` and `en/ticket.json` lose
   the key `dashboard.evaluations.firstResponse`.
5. **The tests**: the test of the snapshot of the API and the test of the wall
   display are adjusted.

## Non-goals

- No change of the tiles, of the counter or of the recent tickets.
- No new text of the dashboard.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the test of the snapshot fails before the change and
passes after it.

## Handoff

- Files changed: the spec of the dashboard, the contract, the service, the
  display and the two locales
- Interfaces added: none — the block of the evaluations loses a field
- Verified: the commands above
- Follow-up WP: none
- Open question: none
