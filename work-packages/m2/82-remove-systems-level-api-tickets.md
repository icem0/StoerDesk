format: small-model
status: pending
depends-on: WP-M2-81
phase: 2
context-budget: 14k tokens
spec: PLAN.md §6, PLAN.md §7, PLAN.md §11
spec-lines: 30

files-read:

- apps/api/src/tickets/report.ts
- apps/api/src/tickets/internal.ts
- apps/api/src/tickets/duplicates.ts
- apps/api/src/tickets/detail.ts

files-write:

- apps/api/src/tickets/report.ts
- apps/api/src/tickets/internal.ts
- apps/api/src/tickets/duplicates.ts
- apps/api/src/tickets/detail.ts

interfaces:

- `report.ts`: removes `systems` import, removes `systemId` validation block, removes `systemId` from insert values.
- `internal.ts`: removes `systems` import, removes `systemId` validation block, removes `systemId` from insert values.
- `duplicates.ts`: removes `systems` import, removes `systemId` validation in `findOpenTickets`, removes `systemFilter` logic.
- `detail.ts`: removes `systems` import, removes `.leftJoin(systems, ...)`, removes `systemType`/`systemLabel` from select and response.

## Task

Remove the system level from the ticket API routes.

1. `report.ts`: no `system_id` lookup anymore; insert `systemId` is simply omitted (column no longer exists).
2. `internal.ts`: same for internal ticket creation.
3. `duplicates.ts`: `findOpenTickets` no longer validates a `systemId` and no longer filters by system — all open tickets of the object are returned.
4. `detail.ts`: ticket detail no longer joins `systems`; `systemType` and `systemLabel` are gone from the response.

## Non-goals

- No replacement field for system on tickets.
- No error code changes besides removing `system_not_found` paths.

## Acceptance

Run and report the exact commands:

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

## Handoff

- Files changed: `apps/api/src/tickets/report.ts`, `apps/api/src/tickets/internal.ts`, `apps/api/src/tickets/duplicates.ts`, `apps/api/src/tickets/detail.ts`
- Follow-up WP: WP-M2-83 (API objects)
- Open question: none
