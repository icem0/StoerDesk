# WP-M9-20: ticket list order — open tickets by deadline

format: small-model
status: done
depends-on: —
phase: 9
milestone: m9
context-budget: 14k tokens
spec: PLAN.md §9, §13; specs/05-timeline.md §5.4
spec-lines: 40

files-read:

- PLAN.md (§9 timeline and escalation, §14 user interface)
- specs/05-timeline.md (§5.4 API representation)
- apps/api/src/tickets/list.ts (the list query)
- packages/shared/src/schemas/ticket.ts (`ticketListQuerySchema`)
- apps/api/src/tickets/__tests__/list.integration.spec.ts (the list test)
- apps/web/src/features/tickets/ticket-list-page.tsx (the consumer of the order)

files-write:

- apps/api/src/tickets/list.ts
- apps/api/src/tickets/__tests__/list.integration.spec.ts
- specs/05-timeline.md

interfaces:

- `GET /api/v1/tickets?order=deadlineAt&direction=asc` — the open tickets first, the nearest deadline first, the finished tickets behind them

## Task

1. Extend the order of the list query: with `order=deadlineAt` the rows come
   with the open tickets first, sorted by the deadline in the requested
   direction. The finished tickets (`CLOSED`, `CANCELLED`) keep the last places,
   so the list does not start with the oldest closed ticket.
2. Leave the other orders (`reportedAt`, `priority`) untouched.
3. Add the integration test: an open ticket with a far deadline, an open ticket
   with the nearest deadline and a closed ticket with an old deadline arrive in
   that order for `order=deadlineAt&direction=asc`.
4. Update `specs/05-timeline.md` §5.4: the list carries the mini timeline and
   orders the open tickets by their remaining time, the finished ones behind
   them.

## Non-goals

- No new filter, no new column and no change of the response shape.
- No change of the ticket list UI (WP-M9-21).
- No sort selector in the web; the list asks for the deadline order.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the integration test runs against a throwaway database and
skips with a named reason otherwise.

## Handoff

- Files changed: the list query, the list integration test, the timeline spec
- Interfaces added: the open-first order of `order=deadlineAt`
- Verified: typecheck, lint, test:run, wp:check
- Follow-up WP: WP-M9-21 (the ticket list rows)
- Open question: none
