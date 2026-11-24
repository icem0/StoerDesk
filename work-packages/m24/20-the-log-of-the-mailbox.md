# WP-M24-20: the log of the mailbox

format: small-model
status: done
depends-on: WP-M24-19
phase: 24
milestone: m24
context-budget: 12k tokens
spec: specs/10-notifications.md §11.8, §11.13, ADR-0046
spec-lines: 20

files-read:

- apps/api/src/notifications/routes.ts (the routes of the layer)
- apps/web/src/admin/email-page.tsx (the mailbox of the instance)

files-write:

- apps/api/src/notifications/routes.ts
- apps/web/src/admin/email-page.tsx, packages/shared/src/schemas/notification.ts
- apps/web/src/i18n/locales/de/settings.json, apps/web/src/i18n/locales/en/settings.json

interfaces:

- `GET /api/v1/admin/notifications/deliveries?channel=email&limit=20` — the last deliveries of a channel
- `notificationDeliveryListResponseSchema` — the log of the deliveries

## Task

1. The route of the log of the deliveries: the last rows of the outbox of a
   channel with the time, the recipient and the result. A mail address is
   masked — the log of the administration never carries a contact value in
   full (§11.13).
2. The mailbox page shows the log: the time, the event, the masked recipient
   and the state of the delivery (ADR-0046 decision 6).

## Non-goals

- No change of the delivery itself.
- No export of the log.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green.

## Handoff

- Files changed: the routes, the page of the mailbox, the shared contracts, the
  labels
- Interfaces added: the route of the log
- Verified: the commands above
- Follow-up WP: none — phase 24 is closed
- Open question: none
