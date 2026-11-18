# WP-M14-124: the web-push subscription endpoint

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 12k tokens
spec: specs/10-notifications.md §11.1, §11.3; PLAN.md §12, §16
spec-lines: 18

depends-on: WP-M14-08, WP-M7-04

files-read:

- apps/api/src/notifications/channels/web-push.ts (the adapter and its VAPID config)
- apps/api/src/notifications/config.ts (the environment fallback of `webpush`)
- apps/api/src/notifications/routes.ts (the account routes and the session guard)
- apps/api/src/db/schema.ts (`push_subscriptions`)
- apps/web/src/settings/notifications-page.tsx (the consumer of the new routes, WP-M14-125)

files-write:

- packages/shared/src/schemas/notification.ts
- apps/api/src/notifications/web-push-subscriptions.ts
- apps/api/src/notifications/routes.ts
- apps/api/src/notifications/**tests**/web-push-subscriptions.integration.spec.ts

interfaces:

- `GET /api/v1/notifications/accounts/webpush` answers
  `{ publicKey, subscribed, subscriptions }` for the signed-in user; `publicKey`
  is the effective VAPID public key and empty while the channel is disabled or
  not configured.
- `POST /api/v1/notifications/accounts/webpush` takes
  `{ endpoint, keys: { p256dh, auth } }` and stores the device of the user.
- `DELETE /api/v1/notifications/accounts/webpush` takes `{ endpoint }` and is
  idempotent `204`.
- The endpoint is the device identity: a repeated subscription replaces the old
  row, so one browser never receives the same notification twice.

## Task

`push_subscriptions` exists since migration `0019`, but no route writes it, so
the adapter of WP-M7-04 always sees an empty list. This package adds the
per-user registration the settings page needs.

1. In `packages/shared/src/schemas/notification.ts`, add the request schemas of
   the subscription and the answer schemas of the state; the endpoint must be a
   URL of at most 2000 characters, `p256dh` and `auth` non-empty strings of at
   most 500 characters.
2. In `apps/api/src/notifications/web-push-subscriptions.ts`, read the VAPID
   public key through `readChannelConfiguration` (never a second env parser),
   count the devices of the user and store/remove one endpoint. The store
   deletes the endpoint before it inserts, so a second user on a shared device
   takes the endpoint over instead of creating a duplicate.
3. In `apps/api/src/notifications/routes.ts`, register the three session-guarded
   routes before the `DELETE /accounts/:channel` route. A malformed body answers
   `422 invalid_request` with the field paths; the `DELETE` answers `204` even
   for an unknown endpoint.
4. In the integration test, cover the missing session, the empty state, the
   invalid body, the idempotent store, the shared-device takeover and the
   idempotent removal.

## Non-goals

- No migration: the table exists and the store keys on the endpoint itself.
- No `push` handler in the service worker and no settings UI — that is WP-M14-125.
- No fan-out of the drain per user; `webpushChannel` keeps sending to every
  stored subscription.
- No log line with the endpoint or a key.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the integration test proves the owner-only counting and
the idempotent removal.

## Handoff

- Files changed: the shared contracts, the new service, the routes and the test
- Interfaces added: the three web-push subscription routes above
- Verified: `npx vitest run apps/api/src/notifications/__tests__/web-push-subscriptions.integration.spec.ts`
- Follow-up WP: WP-M14-125 (service worker and settings UI)
- Open question: none
