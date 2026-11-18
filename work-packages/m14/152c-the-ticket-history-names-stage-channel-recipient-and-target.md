# WP-M14-152c: the ticket history names stage, channel, recipient and target

format: small-model
status: planned
phase: 14
milestone: m14
context-budget: 16k tokens
spec: specs/07-escalation.md §7.7, §7.9, §7.11; specs/10-notifications.md §11.8
spec-lines: 30

depends-on: WP-M14-152b

files-read:

- apps/web/src/features/tickets/ticket-detail-page.tsx (the history section)
- apps/api/src/escalation/config.ts (`readEscalationStages`)
- apps/web/src/i18n/locales/de/ticket.json (the labels of the history)

files-write:

- apps/web/src/features/tickets/ticket-detail-page.tsx
- apps/web/src/i18n/locales/{de,en}/ticket.json

interfaces:

- `GET /api/v1/escalation-stages` feeds the stage names of the history (§7.9)
- `detail.notification.channels.<kind>`, `detail.notification.recipient`,
  `detail.notification.target`

## Task

1. `apps/web/src/features/tickets/ticket-detail-page.tsx`: the page reads the
   stage chain with `GET /v1/escalation-stages` (a TanStack query next to the
   ticket, `retry: false`) and keeps it for the history: the display name of a
   stage key over the names of the interface language and the stage without a
   predecessor — the first stage of the chain (§7.11).
2. The history rows: an `escalated` event whose stage is the first stage of the
   chain renders no row at all — its audit row and its actions stay, the report
   entry already says the ticket arrived. Any other `escalated` and every
   `escalation_note` event names its stage with the display name of the chain
   through `detail.escalation.historyStage`; a raw stage key never shows and an
   unknown key falls back to `detail.field.unknown`.
3. The rows of `notification_sent` and `notification_failed` gain a detail line
   naming what the escalation configured: the channel label
   (`detail.notification.channels.<kind>`), the addressee
   (`detail.notification.recipient`), the configured target
   (`detail.notification.target`) and the stage of the firing through the same
   stage label. Missing payload keys add nothing.
4. `apps/web/src/i18n/locales/{de,en}/ticket.json`: the seven channel labels, the
   recipient label and the target label in both languages.

## Non-goals

- No API change: the payload keys arrive with WP-M14-152a and WP-M14-152b.
- No change of the other history rows, of the photos or of the timeline.
- No new route and no new permission: `ticket.read` already reads the stages.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the page test proves the stage name of a firing, the
suppressed row of the first stage and the named notification recipient.

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: none
- Open question: none
