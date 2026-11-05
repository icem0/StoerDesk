# WP-M6-02: shared deadline and timeline contracts

format: small-model
status: done
depends-on: WP-M6-01
phase: 6
milestone: m6
context-budget: 18k tokens
spec: specs/05-timeline.md §5.1–§5.3; ADR-0008
spec-lines: 90

files-read:

- specs/05-timeline.md (§5.1–§5.3)
- packages/shared/src/index.ts
- packages/shared/src/schemas/ticket.ts (priority values)
- apps/web/src/features/tickets/ticket-detail-page.tsx (status values)

files-write:

- packages/shared/src/timeline.ts
- packages/shared/src/index.ts

interfaces:

- `DEADLINE_HOURS: Record<'low'|'normal'|'high'|'critical', number>`
- `TIMELINE_THRESHOLDS = { yellow: 50, orange: 80 }`
- `deadlineAtFor(base: Date, priority: string, hours?: Partial<Record<…, number>>): Date`
- `computeTicketTimeline(input): { totalMs, pausedMs, elapsedMs, remainingMs, percent, state, stoppedAt }`
- `TimelineState = 'green' | 'yellow' | 'orange' | 'red' | 'stopped'`

## Task

1. Add a pure module with the ADR-0008 deadline table and
   `deadlineAtFor(base, priority, overrides)`; unknown priorities fall back to
   `normal`.
2. Add `computeTicketTimeline({ reportedAt, deadlineAt, stoppedAt, now, pauses })`
   with the formulas of `specs/05-timeline.md` §5.3: closed pauses plus the
   running part of an open pause, capped at the interval, `stopped` wins over
   every colour.
3. Export the module from `packages/shared/src/index.ts`.
4. Add a unit test with closed/open pauses, the 50/80/100 % boundaries and a
   stopped timeline. Tests are excluded from the source-file budget.

## Non-goals

- No API or database read of `settings`.
- No UI.
- No escalation rules (WP-M6-07).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new unit test covers the boundary values.

## Handoff

- Files changed: `packages/shared/src/timeline.ts`, the index export and its test
- Interfaces added: the four exports above
- Verified: typecheck, lint, test:run
- Follow-up WP: WP-M6-03 (per-priority deadline on creation)
- Open question: none
