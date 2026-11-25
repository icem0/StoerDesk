# WP-M30-03: the protocol of the administration

format: ctx-256k
status: planned
depends-on: WP-M30-02
phase: 30
milestone: m30
context-budget: 52k tokens
spec: specs/10-notifications.md §11.10, §11.11, §11.12, §11.16
spec-lines: 90
changed-lines: 600

files-read:

- specs/10-notifications.md §11.12 (the UI), §11.16 (the protocol of the delivery)
- apps/api/src/notifications/messages.ts (the reading of the messages — the protocol of today)
- apps/api/src/notifications/delivery.ts (the problems of the channels and their quittature)
- apps/api/src/notifications/routes.ts (the routes of the administration)
- apps/web/src/admin/delivery-page.tsx (the page of the problems — the model of the new page)
- apps/web/src/admin/channels-page.tsx (the page of the channels)
- apps/web/src/routes/index.tsx, apps/web/src/settings/settings-page.tsx (the routes and the menu)
- packages/shared/src/schemas/notification.ts (the contracts)

files-write:

- apps/api/src/notifications/messages.ts
- apps/api/src/notifications/routes.ts
- packages/shared/src/schemas/notification.ts
- apps/web/src/admin/notifications-page.tsx
- apps/web/src/routes/index.tsx
- apps/web/src/settings/settings-page.tsx
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json

interfaces:

- `readDeliveries(database, filter)` — the attempts with their recipient, their channel, their state and their machine code
- `GET /api/v1/admin/notifications/deliveries` — the protocol of the delivery (`notification.read_all`)
- `NotificationsPage` — the page `/admin/notifications`

## Task

1. **The reading** `apps/api/src/notifications/messages.ts`: `readDeliveries`
   answers the attempts of the table `notification_messages` with the filters
   of §11.16 — the recipient, the channel, the event type and the state — and
   with the machine code of a failure, the time and the number of the attempts.
   The answer carries the list of the recipients with their number of
   attempts; the list applies every filter **except** the filter of the
   recipient.
2. **The route** `apps/api/src/notifications/routes.ts`:
   `GET /api/v1/admin/notifications/deliveries` behind
   `notification.read_all` — the route answers `403 forbidden` without the
   right, because the protocol names the users. The three routes of the
   messages stay until WP-M30-04 removes them.
3. **The contracts** `packages/shared/src/schemas/notification.ts`: the schema
   of an attempt and the answer of the list.
4. **The page** `apps/web/src/admin/notifications-page.tsx`: the table of the
   attempts with the columns — the recipient, the event, the channel, the
   state, the machine code, the time and the attempts — and the filters of
   §11.16 above the table. The page names no address of a user (§11.13) and
   links to the page of the delivery problems for the quittature.
5. **The route and the menu** `apps/web/src/routes/index.tsx` and
   `apps/web/src/settings/settings-page.tsx`: the page `/admin/notifications`
   is an entry of the settings menu next to the delivery problems.
6. **The texts** in `de/settings.json` and `en/settings.json`: the heading, the
   columns, the filters and the empty answer. The texts of the reasons of a
   failure stay in the namespace of the delivery page — the two pages name the
   same codes with the same sentences.
7. **The tests**: the test of the page proves that the filters reach the query,
   that a row without the right is not shown and that the machine code of a
   failure is named; the integration test of the route proves the refusal
   without `notification.read_all`.

## Non-goals

- No change of the inbox — the tasks reach the page in WP-M30-04.
- No change of the problems of the channels and of their quittature
  (`/admin/delivery`).
- No change of the alarm of a failed delivery — WP-M30-05.
- No new permission — the protocol is guarded by `notification.read_all`.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; `i18n:check` reports no missing and no unused key.

## Handoff

- Files changed: the reading, the route, the contracts, the page, the route of
  the web, the menu and the two locales
- Interfaces added: `readDeliveries`, the route
  `GET /api/v1/admin/notifications/deliveries` and the page
  `NotificationsPage`
- Verified: the commands above
- Follow-up WP: WP-M30-04 — the inbox shows the tasks
- Open question: none
