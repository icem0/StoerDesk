# WP-M2-19c: Workflow API routes (server)

format: small-model
status: implemented
depends-on: WP-M2-19b, WP-M1-08
phase: 4
context-budget: 25k tokens
spec: PLAN.md §7 (ticket workflow rules 2-10), PLAN.md §6 (tickets table)
spec-lines: 60

files-read:

- apps/api/src/tickets/workflow.ts — transitionTicket() function
- apps/api/src/auth/requirePermission.ts — requirePermission pattern
- apps/api/src/tickets/detail.ts — route registration pattern
- packages/shared/src/schemas/ticket.ts — existing ticket schemas

files-write:

- apps/api/src/tickets/workflow-routes.ts — POST /api/v1/tickets/:ticketNo/{review,work-order,assign,offer,claim,accept,decline,acknowledge,close,reopen,cancel}
- apps/api/src/index.ts — register workflow routes

interfaces:

- One POST route per workflow event, each guarded by the matching
  `ticket.*` permission (review, assign, offer, claim, accept, acknowledge,
  close, reopen, cancel). Each route calls `transitionTicket()` with the event
  name and actor user id, and returns the updated ticket.
- `work-order` accepts optional `{ type, number }` in the body.
- `decline` requires `{ reason }` (min. 5 chars).
- `acknowledge` requires `{ result }` (fixed|partial|follow_up|none) and optional
  `{ note }`.
- `reopen` and `cancel` require `{ reason }` (min. 5 chars).

## Task

1. `apps/api/src/tickets/workflow-routes.ts`: define all 11 POST routes as a
   single fastify-plugin, each guarded by `requirePermission(database,
   PERMISSIONS.ticket.<event>)` and delegating to `transitionTicket()`.
2. `apps/api/src/index.ts`: register `workflowRoutes` with `{ database }` options.

## Non-goals

- Workflow columns (assigned_user_id, accepted_at, …) written to the ticket row
  — these are added by migration 0006 and will be written by the routes once
  the schema includes them (schema.ts currently excludes them so tests pass).
- ticket_pauses, pg-boss timers, escalation — phase 6.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green. Needs a database for integration tests; without one they skip.

## Handoff

- Files changed: the two files above
- Interfaces added: `POST /api/v1/tickets/:ticketNo/{review,work-order,assign,offer,claim,accept,decline,acknowledge,close,reopen,cancel}`
- Follow-up WP: WP-M2-19d (workflow UI actions)
