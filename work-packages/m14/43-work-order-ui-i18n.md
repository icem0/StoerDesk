# WP-M14-43: Arbeitsauftrag als freies Textfeld (UI + i18n)

format: small-model
status: planned
depends-on: WP-M14-42
phase: 14
context-budget: 16k tokens
spec: PLAN.md §14; PLAN.md §3.1

files-read:

- packages/shared/src/schemas/ticket.ts
- apps/api/src/tickets/detail.ts

files-write:

- apps/web/src/features/tickets/ticket-detail-page.tsx
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json

interfaces:

- `ticket-detail-page.tsx`: Das `work_order_set`-Dialog ersetzt die beiden starren Felder (Auftragsart + Auftragsnummer) durch ein einzelnes freies Textfeld (`workOrderText`). Der Verlauf rendert `escalation_note`-Events mit der Eskalationsstufe als Überschrift und dem Notiz-Text (Korrespondent ist "System").
- `de/ticket.json` + `en/ticket.json`: `detail.prompt.workOrderText` ersetzt `detail.prompt.workOrderType` / `detail.prompt.workNumber`; `status.events.escalation_note` hinzugefügt.

## Task

1. `apps/web/src/features/tickets/ticket-detail-page.tsx`: `case 'work_order_set'` im Confirm-Panel zeigt ein einzelnes Textfeld statt zweier Felder und sendet `{ text }` als Payload.
2. `apps/web/src/features/tickets/ticket-detail-page.tsx`: Verlauf-Code liest `event.payload.stage` (neben `stageKey`) als Fallback für die Stufe bei `escalation_note`.
3. `apps/web/src/i18n/locales/de/ticket.json`: `detail.prompt.workOrderText` und `status.events.escalation_note` hinzufügen, `workOrderType` / `workOrderNumber` entfernen.
4. `apps/web/src/i18n/locales/en/ticket.json`: Entsprechende englischen Keys.

## Non-goals

- Ticket-Liste mit `workOrderText` — das ist WP-M14-44.
- `list.ts` und `ticketListItemSchema` — das ist WP-M14-44.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run i18n:check
```

Expected: alle grün.

## Handoff

- Files changed: `ticket-detail-page.tsx`, `de/ticket.json`, `en/ticket.json`
- Verified: `npm run check` (teilweise) grün
- Follow-up WP: WP-M14-44
