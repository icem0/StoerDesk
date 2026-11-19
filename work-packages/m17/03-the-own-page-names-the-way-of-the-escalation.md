# WP-M17-03: the own page names the way of the escalation

format: small-model
status: done
depends-on: WP-M17-02
phase: 17
milestone: m17
context-budget: 16k tokens
spec: specs/10-notifications.md §11.4, §11.12; ADR-0037
spec-lines: 40

files-read:

- apps/web/src/settings/notifications-page.tsx (the selection section)
- apps/web/src/i18n/locales/de/common.json (the texts of the selection)
- apps/web/src/i18n/locales/en/common.json (the texts of the selection)
- apps/web/src/settings/__tests__/notifications-page.test.tsx (the pattern of the test)

files-write:

- apps/web/src/settings/notifications-page.tsx (the hint of the selection)
- apps/web/src/i18n/locales/de/common.json and
  apps/web/src/i18n/locales/en/common.json (the texts of the selection)

interfaces:

- the hint `notifications.selection.hint` — the selection decides the way, the
  escalation rule decides the recipient
- the hint `notifications.selection.escalatedHint` — the row of the escalation
  names the rule of ADR-0037

## Task

1. `apps/web/src/settings/notifications-page.tsx` names the rule of ADR-0037 in
   the selection section: the selection of the user decides **over which way**
   a notification of the event type reaches them; the escalation rule of the
   administration decides **to whom** an escalation goes.
2. The row of the event type `ticket.escalated` carries its own short hint: an
   escalation that addresses the user arrives over the selected channels — and
   without a selection over the own ntfy topic.
3. The texts of `de` and `en` follow; the new key
   `notifications.selection.escalatedHint` exists in both locales, no other key
   changes.
4. The test `apps/web/src/settings/__tests__/notifications-page.test.tsx` proves
   that the hint of the escalation row is shown and that the save body of the
   selection stays the same.

## Non-goals

- No change of the channels of the selection, of the linked accounts, of the QR
  of ntfy and of the sections of Telegram, Matrix, WhatsApp and Web Push.
- No new route and no new permission.
- No change of the readiness block — ADR-0021 already gives the technician the
  choice of the channel.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run i18n:check
npm run test:run
npm run wp:check
```

Expected: all green; the new assertions fail before the change and pass after it.

## Handoff

- Files changed: `apps/web/src/settings/notifications-page.tsx`,
  `apps/web/src/i18n/locales/de/common.json`,
  `apps/web/src/i18n/locales/en/common.json`, the test
  `apps/web/src/settings/__tests__/notifications-page.test.tsx`
- Interfaces added: the text `notifications.selection.escalatedHint` — the row of
  the escalation names the way of the recipient
- Verified: `npm run typecheck`, `npm run lint`, `npm run i18n:check`,
  `npm run test:run`, `npm run wp:check`
- Follow-up WP: none — phase 17 is closed
- Open question: none
