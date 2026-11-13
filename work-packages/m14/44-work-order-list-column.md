# WP-M14-44: Arbeitsauftrag-Text in der Ticket-Liste

format: small-model
status: planned
depends-on: WP-M14-42
phase: 14
context-budget: 12k tokens
spec: PLAN.md §6

files-read:

- apps/api/src/db/schema.ts
- apps/api/src/tickets/detail.ts
- apps/api/src/tickets/workflow.ts

files-write:

- apps/api/src/tickets/list.ts
- packages/shared/src/schemas/ticket.ts

interfaces:

- `ticketListItemSchema` (shared): erhält `workOrderText: z.string().nullable()`.
- `ticketListResponseSchema` (shared): unverändert (enthält das Item-Array).
- `list.ts`: Selektiert `tickets.work_order_text` als `workOrderText` und gibt es im Listeneintrag zurück.

## Task

1. `packages/shared/src/schemas/ticket.ts`: `ticketListItemSchema` um `workOrderText` ergänzen.
2. `apps/api/src/tickets/list.ts`: `workOrderText: tickets.workOrderText` im Select und `workOrderText: row.workOrderText` im Mapping.

## Non-goals

- UI der Liste (Web) — die Spalte wird von der API geliefert, die Web-UI rendert sie in einem späteren WP.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
```

Expected: beide grün.

## Handoff

- Files changed: `list.ts`, `ticket.ts` (shared)
- Verified: `npm run typecheck` grün
- Follow-up WP: Kein direktes Follow-up.
