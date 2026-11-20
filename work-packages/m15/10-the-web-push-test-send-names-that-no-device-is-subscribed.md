# WP-M15-10: the web push test send never reports success while no device is subscribed

format: small-model
status: done
depends-on: WP-M15-09
phase: 15
milestone: m15
context-budget: 16k tokens
spec: specs/10-notifications.md §11.15
spec-lines: 14

files-read:

- apps/api/src/notifications/routes.ts (the test send of a channel)
- apps/api/src/notifications/channels/web-push.ts (the empty subscription list)
- apps/api/src/notifications/channels/index.ts (the web push channel and its rows)
- apps/api/src/notifications/__tests__/routes.unit.spec.ts (the fake database)
- apps/web/src/i18n/locales/de/settings.json (`admin.delivery.reasons.*`)
- apps/web/src/i18n/locales/en/settings.json (the English counterpart)

files-write:

- apps/api/src/notifications/routes.ts
- apps/api/src/notifications/__tests__/routes.unit.spec.ts
- apps/web/src/i18n/locales/de/settings.json,
  apps/web/src/i18n/locales/en/settings.json
- specs/10-notifications.md, CHANGELOG.md, docs/REPO-MAP.md,
  work-packages/README.md, this document

interfaces:

- the machine code `push_no_subscription`: a test send that reaches no device
- the texts `admin.delivery.reasons.push_no_subscription` in `de` and `en`

## Task

**The fault of the office (out of band in phase 15).** The Web Push card of a
server whose VAPID trio was fine answered „Testnachricht gesendet." — while not
one browser had ever subscribed. An empty subscription list is a no-op of the
adapter (§11.15, WP-M7-09), so the send delivered nothing and the click proved
nothing: the operator kept chasing the keys and the firewall while the actual
state was „nobody is subscribed".

1. `POST /api/v1/admin/channels/webpush/test` counts the rows of
   `push_subscriptions` before it calls the adapter. Without a single row it
   answers `delivered: false` with the new code `push_no_subscription` — the
   adapter and its no-op stay untouched (§11.15), only the probe of the
   administration names the state.
2. `admin.delivery.reasons.push_no_subscription` names it in `de` and `en`:
   nothing was sent to no device, the devices have to register themselves on the
   settings page first. The channel card (WP-M15-09) and the delivery page read
   this text.
3. The route test drives the fake database over `push_subscriptions`: without a
   row the answer is the code, with one row the adapter runs and the answer is
   `delivered: true`.

## Non-goals

- No change of `sendWebPushNotification`, `webPushChannel` or the outbox chain:
  an empty subscription list stays a no-op for a ticket notification.
- No auto-subscription of the administration browser and no new permission.
- No change of the dead-subscription rule (§11.15).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run test:run
npm run i18n:check
npm run check
```

Expected: green; the probe names „no device subscribed" instead of a silent
success.

## Handoff

- Files changed: the route, the route test, both locale files, the spec, the
  repository bookkeeping
- Interfaces added: `push_no_subscription` and its texts
- Verified: `npm run typecheck`, `npm run test:run`, `npm run i18n:check`,
  `npm run check`
- Follow-up WP: none — the test send of the web push is closed
- Open question: none
