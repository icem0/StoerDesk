# WP-M10-08: External ticket API and API-key work-order update

format: small-model
status: done
depends-on: WP-M10-07
phase: 10
milestone: m10
context-budget: 20k tokens
spec: specs/08-objects-api.md §9.5; specs/03-ticket-workflow.md §5
spec-lines: 120

files-read:

- specs/08-objects-api.md (§9.5)
- apps/api/src/tickets/internal.ts
- apps/api/src/tickets/list.ts
- apps/api/src/tickets/workflow.ts

files-write:

- apps/api/src/tickets/{external.ts,internal.ts,list.ts,workflow.ts,pauses.ts,__tests__/external.integration.spec.ts}
- packages/shared/src/schemas/ticket.ts
- apps/api/src/index.ts

interfaces:

- `GET /api/v1/tickets?updated_since=&status=&objectNo=&limit=`
- `POST /api/v1/tickets` with `source = 'api'`
- `PATCH /api/v1/tickets/:ticketNo/work-order`
- `transitionTicket` accepts `actorKind = 'system'`

## Task

1. Add `tickets/external.ts` with the external list, create and work-order
   routes, guarded by `tickets:read` / `tickets:write`.
2. External creation resolves `objectNo`, reuses the internal creation service
   and writes `source = 'api'`.
3. Extend `transitionTicket` so an API-key action records
   `actor_kind = 'system'` with the key id in the payload.
4. Add the shared query/request schemas, register the plugin and test both
   authentication modes, invalid transitions and unknown tickets.

## Non-goals

- No external workflow beyond the work-order update.
- No new state-machine transition.
- No webhook delivery (WP-M10-10).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; external create and work-order update work, invalid
transitions answer `409`, events carry the system actor and key id.

## Handoff

- Files changed: the external ticket module, the internal/list dispatch, the
  workflow extension, the shared schemas, the server registration and an
  integration test
- Interfaces added: the external ticket endpoints and system actor support
- Verified: the commands above
- Follow-up WP: WP-M10-09, WP-M10-10
- Open question: none
