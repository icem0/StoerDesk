# WP-M14-42: Arbeitsauftrag als freies Textfeld (API Core)

format: small-model
status: planned
depends-on: WP-M14-41
phase: 14
context-budget: 16k tokens
spec: PLAN.md §7 rule 3; PLAN.md §9

files-read:

- packages/shared/src/schemas/ticket.ts
- apps/api/src/tickets/list.ts
- apps/api/src/tickets/escalation.ts
- apps/api/src/escalation/actions.ts

files-write:

- apps/api/src/db/migrations/0035_work_order_text.sql
- apps/api/src/db/schema.ts
- apps/api/src/tickets/workflow.ts
- apps/api/src/tickets/detail.ts

interfaces:

- Migration `0035_work_order_text.sql` fügt die Spalte `tickets.work_order_text` (nullable text) hinzu.
- `schema.ts` deklariert `workOrderText: text('work_order_text')` auf der `tickets`-Tabelle.
- `workflow.ts`: Die `work_order_set`-Transition schreibt `payload.text` in `work_order_text` statt `work_order_type` / `work_order_number` getrennt zu speichern.
- `detail.ts`: Die Detail-API selektiert und liefert `workOrderText` im Ticket-Objekt.

## Task

1. `apps/api/src/db/migrations/0035_work_order_text.sql`: `ALTER TABLE tickets ADD COLUMN work_order_text text;`
2. `apps/api/src/db/schema.ts`: `workOrderText: text('work_order_text')` neben `workOrderType` / `workOrderNumber` hinzufügen.
3. `apps/api/src/tickets/workflow.ts`: `work_order_set` schreibt `workflowColumns.workOrderText = payload.text`.
4. `apps/api/src/tickets/detail.ts`: `workOrderText: tickets.workOrderText` im Select und `workOrderText: ticketRow.workOrderText` im Rückgabeobjekt.

## Non-goals

- UI-Änderungen (freies Textfeld im Dialog, Verlauf-Anzeige) — das ist WP-M14-43.
- Shared-Schema-Erweiterung für die Liste (`ticketListItemSchema`) — das ist WP-M14-43.
- `list.ts` Selektion von `workOrderText` — das ist WP-M14-43.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
```

Expected: beide grün.

## Handoff

- Files changed: `0035_work_order_text.sql`, `schema.ts`, `workflow.ts`, `detail.ts`
- Verified: `npm run typecheck` grün
- Follow-up WP: WP-M14-43
