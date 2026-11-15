# WP-M14-40c: the administration offers the `status_change` action

format: small-model
status: done
depends-on: WP-M14-40b
phase: 14
context-budget: 16k tokens
spec: specs/07-escalation.md §7.5
spec-lines: 40

files-read:

- apps/web/src/admin/escalation-action-editor.tsx
- apps/web/src/admin/escalation-page.tsx
- packages/shared/src/schemas/ticket.ts (`ticketStatusKeySchema`)
- apps/api/src/tickets/status-service.ts (`readTicketStatuses`)

files-write:

- apps/web/src/admin/escalation-action-editor.tsx
- apps/web/src/admin/escalation-page.tsx
- apps/web/src/i18n/locales/de/settings.json, apps/web/src/i18n/locales/en/settings.json

interfaces:

- `EscalationActionEditor` takes the configured status keys (`statuses: string[]`)
- the type select of the editor offers `status_change` with the label
  `admin.escalation.action.types.status_change` and a single-select target-status
  field `admin.escalation.action.statusTarget`

## Task

1. `apps/web/src/admin/escalation-page.tsx`: read the statuses of the installation
   with the existing administration route `GET /api/v1/admin/statuses` (WP-M14-36,
   `settings.read`) as a TanStack query and pass the **active** status keys into
   `RuleForm` and on into `EscalationActionEditor`.
2. `apps/web/src/admin/escalation-action-editor.tsx`: the type select already
   renders the shared `ESCALATION_ACTION_TYPES`, so `status_change` shows with its
   label; add the target-status control — a single select over the passed
   `statuses` with the label `admin.escalation.action.statusTarget`; `shapeOf` and
   `actionOf` carry `toStatus`, the key of an existing status never enters an
   invalid body (the client validates the key format with
   `ticketStatusKeySchema` before the request of WP-M14-39/40b sees the body).
3. Texts: the labels `admin.escalation.action.types.status_change` ("Status
   change"/"Status change") and `admin.escalation.action.statusTarget`
   ("Ziel-Status"/"Target status") in `de` and `en`.
4. Test: the action-editor page test proves the new option, the target select over
   the configured statuses and that the saved action body carries `toStatus`.

## Non-goals

- No API, schema or migration change (WP-M14-40, WP-M14-40b).
- No time-based conditions (WP-M14-41), no readiness action (ADR-0021 stays with
  WP-M14-28).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the escalation administration can add a `status_change`
action whose target comes from the configured statuses and saves it through the
`PUT /api/v1/escalation/config` of WP-M14-40b.

## Handoff

- Files changed: the action editor, the escalation page, the two locale files
- Interfaces added: `status_change` in the action editor with its target select
- Verified: typecheck, ESLint, vitest, `i18n:check` (de/en parity)
- Follow-up WP: none of its own — WP-M14-41 (time-based conditions) is the next
  open item of the phase in numeric order
- Open question: none
