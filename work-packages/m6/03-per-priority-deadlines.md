# WP-M6-03: per-priority deadlines on ticket creation

format: small-model
status: planned
depends-on: WP-M6-02
phase: 6
milestone: m6
context-budget: 18k tokens
spec: specs/05-timeline.md §5.1; specs/02-data-model.md §4.8; ADR-0008
spec-lines: 60

files-read:

- packages/shared/src/timeline.ts
- apps/api/src/tickets/report.ts
- apps/api/src/tickets/internal.ts
- apps/api/src/settings/branding.ts (settings read pattern)
- apps/api/src/db/schema.ts (settings table)

files-write:

- apps/api/src/tickets/deadline.ts
- apps/api/src/tickets/report.ts
- apps/api/src/tickets/internal.ts

interfaces:

- `readDeadlineHours(database): Promise<Record<TicketPriority, number>>` — reads
  `ticket.deadline_hours.<priority>` from `settings`, falls back to ADR-0008
- `deadlineAtForPriority(database, base, priority): Promise<Date>`
- Internal creation and the public report use it; the report stays `normal`

## Task

1. Add `apps/api/src/tickets/deadline.ts`: read the four settings rows in one
   query, accept only positive finite numbers, otherwise use the shared defaults.
2. Replace `INTERNAL_DEADLINE_MS` in `internal.ts` with the resolved deadline.
3. Replace `REPORT_DEADLINE_MS` in `report.ts` with the `normal` default; keep
   the existing clock-skew base rule.
4. Extend the existing report/internal integration tests with a high- and a
   critical-priority case (`24 h`, `8 h`) and an override row.

## Non-goals

- No settings UI.
- No contract-type deadline.
- No change to the clock-skew rule or the ticket number.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; integration tests skip only without PostgreSQL.

## Handoff

- Files changed: the deadline helper, the two creation paths and their tests
- Interfaces added: `readDeadlineHours`, `deadlineAtForPriority`
- Verified: typecheck, lint, test:run
- Follow-up WP: WP-M6-04 (pause table)
- Open question: none
