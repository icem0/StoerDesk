# WP-M6-10: timeline and pause data in the ticket API

format: small-model
status: planned
depends-on: WP-M6-04, WP-M6-06
phase: 6
milestone: m6
context-budget: 20k tokens
spec: specs/05-timeline.md §5.3–§5.4
spec-lines: 70

files-read:

- specs/05-timeline.md §5.3–§5.4
- apps/api/src/tickets/detail.ts
- apps/api/src/tickets/list.ts
- packages/shared/src/schemas/ticket.ts
- packages/shared/src/timeline.ts

files-write:

- apps/api/src/tickets/detail.ts
- apps/api/src/tickets/list.ts
- packages/shared/src/schemas/ticket.ts

interfaces:

- detail answer gains `timeline` (the object of §5.4) and `pauses` (the closed
  and open rows, newest last)
- list item gains `timelineState`, `percent`, `remainingMs`
- shared Zod schemas `ticketTimelineSchema`, `ticketPauseSchema`

## Task

1. Extend the shared schemas so API and web share the timeline and pause shape.
2. In `detail.ts` load the pauses and the event markers, call
   `computeTicketTimeline` with `acknowledged_at` as `stoppedAt` and answer the
   timeline plus the pause rows.
3. In `list.ts` compute `state/percent/remainingMs` from `reported_at`,
   `deadline_at` and `acknowledged_at`; no pause query per row (documented as
   the mini timeline of §5.4).
4. Extend the detail and list integration tests with a paused and an overdue
   ticket.

## Non-goals

- No UI (WP-M6-11/WP-M6-12).
- No per-row pause aggregation in the list.
- No new endpoint.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the API schemas parse the new answers.

## Handoff

- Files changed: detail, list, shared ticket schemas and their tests
- Interfaces added: `timeline`, `pauses`, the three list fields
- Verified: typecheck, lint, test:run
- Follow-up WP: WP-M6-11 (web timeline)
- Open question: none
