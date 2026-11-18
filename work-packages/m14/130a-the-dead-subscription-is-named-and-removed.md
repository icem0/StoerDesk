# WP-M14-130a: the adapter names a dead subscription and the channel removes it

format: small-model
status: planned
phase: 14
milestone: m14
context-budget: 16k tokens
spec: specs/10-notifications.md §11.15; PLAN.md §12; ADR-0028
spec-lines: 14

depends-on: WP-M14-130, WP-M14-124, WP-M7-09

files-read:

- apps/api/src/notifications/channels/web-push.ts (the adapter and its VAPID config)
- apps/api/src/notifications/channels/index.ts (the webpush closure of the chain)
- apps/api/src/notifications/web-push-subscriptions.ts (the store of the devices)
- apps/api/src/notifications/__tests__/web-push-subscriptions.integration.spec.ts (the test pattern)

files-write:

- apps/api/src/notifications/channels/web-push.ts
- apps/api/src/notifications/channels/index.ts
- apps/api/src/notifications/web-push-subscriptions.ts

interfaces:

- `sendWebPushNotification(config, message, pwaUrl, subscriptions, sendImpl?)` answers
  `{ deadEndpoints: string[] }` next to its send; it throws
  `WebPushError('push_subscription_dead')` only when **every** device of the
  send is dead
- `pruneDeadWebPushSubscriptions(database, endpoints): Promise<number>` — removes
  the rows of `push_subscriptions` of the given endpoints
- The error code `push_subscription_dead` reaches `lastError` of the outbox row
  over the chain of WP-M14-118

## Task

1. In `apps/api/src/notifications/channels/web-push.ts`, the send loop no longer
   stops at the first failure: a failure with the status `404` or `410` names
   the endpoint as dead and the send continues with the next device. The
   function answers the dead endpoints; when every device is dead it throws
   `WebPushError('push_subscription_dead')`, so the drain falls back to the
   next channel of the chain (§11.1). A failure with another status keeps the
   code `send_failed`.
2. In `apps/api/src/notifications/web-push-subscriptions.ts`, add
   `pruneDeadWebPushSubscriptions(database, endpoints)` — it removes the rows of
   the given endpoints and answers the number of the removed rows. The
   endpoints are capability urls and never enter a log line.
3. In `apps/api/src/notifications/channels/index.ts`, the webpush closure
   removes the dead endpoints of a send that reached at least one live device.
   A send where every device is dead keeps the rows: the retry of the drain
   probes them again and the row ends `FAILED` with the code
   `push_subscription_dead`, so the chain falls back.
4. Add a unit test that proves a `404` names the endpoint and the send reaches
   the next device; add an integration test that proves the dead rows are gone
   after a send with one dead and one live device.

## Non-goals

- No daily test push (ADR-0028, decision 1).
- No change of the fallback chain.
- No warning over another channel — that is WP-M14-130c.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; a dead device is named with `push_subscription_dead` and
removed after the next successful send.

## Handoff

- Files changed: the adapter, the webpush closure, the subscription store and
  their tests
- Interfaces added: `{ deadEndpoints }` next to the send, `pruneDeadWebPushSubscriptions`
- Verified: `npm run check`, `npm run build`
- Follow-up WP: WP-M14-130b (the instance row of the warning)
- Open question: none
