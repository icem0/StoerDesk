# WP-M14-40: status_change as escalation action

format: small-model
status: planned
depends-on: WP-M14-39b
phase: 14
context-budget: 22k tokens
spec: specs/07-escalation.md §7.5, §7.11
spec-lines: 40

files-read:

- packages/shared/src/schemas/escalation-config.ts
- apps/api/src/db/migrations/0031_escalation_config.sql
- apps/api/src/escalation/actions.ts
- apps/api/src/tickets/workflow.ts
- apps/web/src/admin/escalation-action-editor.tsx

files-write:

- apps/api/src/db/migrations/0036_escalation_action_status_change.sql
- packages/shared/src/schemas/escalation-config.ts
- apps/api/src/escalation/actions.ts
- apps/web/src/admin/escalation-action-editor.tsx

interfaces:

- Action-Typ `status_change` mit Config `{ to_status: string }`
- `dispatchEscalationActions` ruft `transitionTicket` für `status_change`-Aktionen auf

## Task

1. Migration `0036_escalation_action_status_change.sql`: Erweitere den CHECK auf `escalation_actions.type` um `'status_change'`; füge ggf. Spalte `to_status` (text, nullable, FK auf `ticket_statuses(key)`) hinzu oder speichere sie in `config.jsonb`.
2. `packages/shared/src/schemas/escalation-config.ts`: `ESCALATION_ACTION_TYPES` ergänzt um `'status_change'`; `escalationActionConfigSchema` bekommt eine dritte Discriminated-Union-Variante mit `type: z.literal('status_change')` und `to_status: z.string().min(1)`.
3. `apps/api/src/escalation/actions.ts`: `dispatchEscalationActions` verarbeitet `status_change`: lädt das Ticket, ruft `transitionTicket` mit dem Ziel-Status auf, schreibt ein `escalation_note`-Event mit dem neuen Status; im selben Transaktionsblock wie die anderen Aktionen.
4. `apps/web/src/admin/escalation-action-editor.tsx`: Auswahl `status_change` im Typ-Select; Eingabefeld für Ziel-Status (Dropdown aus konfigurierbaren Stati); Label aus i18n.

## Non-goals

- Keine Zeitabhängigkeit (WP-M14-41).
- Keine Änderung der harten Regel „Eskalation ändert nie den Status" in `specs/07-escalation.md` §7.11 — diese Spezifikation wird durch diesen WP ersetzt/ergänzt (neuer Abschnitt für `status_change`).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
npm run db:migrate
```

Expected: alle grün; Migration ergänzt `status_change`; eine Eskalations-Regel mit `status_change`-Aktion ändert bei Feuern den Ticket-Status auf den konfigurierten Ziel-Status; das `escalated`-Event plus ein `status_changed`-Note-Event werden geschrieben; ungültige Ziel-Status werden mit `400` abgelehnt.

## Handoff

- Files changed: `0036_escalation_action_status_change.sql`, `escalation-config.ts`, `actions.ts`, `escalation-action-editor.tsx`
- Interfaces added: Action-Typ `status_change` mit `to_status`
- Verified: `npm run check` grün
- Follow-up WP: WP-M14-41 (Zeitabhängige Bedingungen für Nacht-/Tag-Workflows)
- Open question (if any): ob der Statuswechsel durch Eskalation auch die Workflow-Spalten (`accepted_at`, …) schreibt oder nur den `status`-Wert.
