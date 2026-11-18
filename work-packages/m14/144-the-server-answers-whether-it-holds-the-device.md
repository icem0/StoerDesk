# WP-M14-144: the server answers whether it holds the device of this browser

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 16k tokens
spec: specs/10-notifications.md §11.1, §11.3, §11.12
spec-lines: 24

depends-on: WP-M14-142

files-read:

- apps/api/src/notifications/web-push-subscriptions.ts (the devices of WP-M14-124)
- apps/api/src/notifications/routes.ts (the routes of the accounts)
- packages/shared/src/schemas/notification.ts (the contracts of the channel)
- apps/api/src/notifications/__tests__/web-push-subscriptions.integration.spec.ts

files-write:

- packages/shared/src/schemas/notification.ts
- apps/api/src/notifications/web-push-subscriptions.ts
- apps/api/src/notifications/routes.ts
- apps/api/src/notifications/__tests__/web-push-subscriptions.integration.spec.ts

interfaces:

- `hasWebPushSubscription(database, userId, endpoint): Promise<boolean>` — whether
  the server holds the row of this device of this user
- `webPushSubscriptionCheckRequestSchema` (`{ endpoint }`),
  `webPushSubscriptionCheckResponseSchema` (`{ registered }`)
- `POST /api/v1/notifications/accounts/webpush/check` — the answer of the
  question, never the endpoint itself

## Task

**The other half of the question.** The browser knows its own subscription, the
server knows its rows — only both together say whether a push can arrive. A
browser whose row was removed (a dead device, a restored database, a shared
device of another user) holds a subscription the server never sends to.

1. The service answers the question with one read: `hasWebPushSubscription`
   looks for the row of the user and the endpoint.
2. The shared package learns the request and the answer of the check; the
   endpoint travels in the body (a capability URL never enters a log line) and
   the answer carries a boolean only.
3. The route `POST /api/v1/notifications/accounts/webpush/check` answers
   `{ registered }` for the signed-in user; a body without an endpoint answers
   `422 invalid_request` with the field path.
4. The integration test proves the answer for the own device, for a foreign
   device and for a device without a row.

## Non-goals

- No change of the routes of WP-M14-124 — the check is a route of its own.
- No change of the web app — the card and the inbox ask the question with
  WP-M14-145 and WP-M14-146.
- No endpoint in an answer and no endpoint in a log line.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the route answers `registered` for the own device only.

## Handoff

- Files changed: the shared contracts, the service, the routes and the test
- Interfaces added: `hasWebPushSubscription`, the two schemas and the route
- Verified: `npm run check` (exit 0), the vitest file of the web-push routes
- Follow-up WP: WP-M14-145 (the card asks the server about this device) — the
  document exists in this commit
- Open question: none
