# WP-M6-06: pause routes and acknowledge auto-close

format: small-model
status: planned
depends-on: WP-M6-05
phase: 6
milestone: m6
context-budget: 18k tokens
spec: specs/05-timeline.md §5.2, §5.4
spec-lines: 40

files-read:

- specs/05-timeline.md §5.2
- apps/api/src/tickets/pauses.ts
- apps/api/src/tickets/workflow.ts
- apps/api/src/tickets/workflow-routes.ts (route pattern)
- apps/api/src/index.ts (route registration)

files-write:

- apps/api/src/tickets/pauses.ts
- apps/api/src/tickets/workflow.ts
- apps/api/src/index.ts

interfaces:

- `POST /api/v1/tickets/:ticketNo/pause` body `{ reason }` guarded by
  `ticket.review` — `201 { pause }`
- `POST /api/v1/tickets/:ticketNo/resume` guarded by `ticket.review` —
  `200 { pause }`
- `transitionTicket()` closes an open pause when the event is `acknowledged`,
  `closed` or `cancelled`

## Task

1. Add `pauseRoutes` to `pauses.ts`: resolve `ticket_no`, parse the reason
   (3–500 trimmed characters), call the service and map `PauseError` to
   `{ code, params }`.
2. In `transitionTicket()`, inside the existing transaction, call
   `closeOpenPause(tx, …)` for `acknowledged`, `closed` and `cancelled`; the
   acting user ends the pause.
3. Register `pauseRoutes` in `apps/api/src/index.ts`.
4. Extend the pause integration test with both routes and the auto-close after
   acknowledge.

## Non-goals

- No new permission key.
- No offline pause (online-only, like claim).
- No UI.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the integration test covers 201/200/409 and auto-close.

## Handoff

- Files changed: pause routes, workflow transaction, route registration, test
- Interfaces added: the two routes and the auto-close rule
- Verified: typecheck, lint, test:run
- Follow-up WP: WP-M6-07 (escalation rules)
- Open question: none
