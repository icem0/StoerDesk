# WP-M14-170: the web push sends with one VAPID trio

format: small-model
status: done
depends-on: WP-M14-130c
phase: 14
milestone: m14
context-budget: 24k tokens
spec: specs/10-notifications.md §11.2, §11.15
spec-lines: 42

files-read:

- apps/api/src/notifications/config.ts (the merge of the row over the environment)
- apps/api/src/notifications/channels/index.ts (the webpush closure of the chain)
- apps/api/src/notifications/channels/web-push.ts (the adapter and its error codes)
- apps/api/src/notifications/web-push-subscriptions.ts (the public key of the browser)
- apps/api/src/notifications/__tests__/web-push-subscriptions.integration.spec.ts
- specs/10-notifications.md (§11.2)

files-write:

- apps/api/src/notifications/config.ts (the VAPID trio and its reader)
- apps/api/src/notifications/web-push-subscriptions.ts (the public key of the browser)
- apps/api/src/notifications/channels/index.ts (the send of the closure)
- apps/api/src/notifications/__tests__/web-push-subscriptions.integration.spec.ts,
  specs/10-notifications.md, CHANGELOG.md, docs/REPO-MAP.md,
  work-packages/README.md, this document

interfaces:

- `webPushTrio(row, env): WebPushTrio` — the effective VAPID trio of the
  administration and the environment
- `readWebPushConfiguration(database, env): Promise<WebPushConfiguration>` — the
  trio, whether the channel is switched off and whether the trio is complete
- the rule of §11.2: the row of the administration wins over the environment
  **as a whole**

## Task

**The fault of the office (out of band in phase 14).** The web push of the
instance delivers nothing: every send of the channel fails and the delivery
page names the code `send_failed`.

**The cause.** The browser subscribed with the public key of the **effective
configuration** — the row of `notification_channels` wins over the environment
(§11.2) — while the server signed every send with the keys of the
**environment** alone (`apps/api/src/notifications/channels/index.ts`). As soon
as the two differ, the browser holds a subscription of a key pair that the
server does not own: the push service answers `403` and every send fails.

1. `apps/api/src/notifications/config.ts` gains the **VAPID trio**: the public
   key, the private key and the subject belong together. `webPushTrio(row, env)`
   returns the trio of the row of the administration when the row carries all
   three values, otherwise the trio of the environment. `readChannelConfiguration`
   uses the rule for the kind `webpush`, so the administration shows the same
   trio the send uses.
2. `readWebPushConfiguration(database, env)` reads the row of the kind
   `webpush` and answers the trio, whether the administration switched the
   channel off and whether the trio is complete enough to send.
3. `apps/api/src/notifications/web-push-subscriptions.ts` answers the public key
   of that configuration — the browser subscribes with the key the server signs
   with.
4. `apps/api/src/notifications/channels/index.ts` sends with that trio instead
   of the environment alone.
5. The integration test proves the rule: without a row the trio of the
   environment counts, a row without a secret leaves it untouched, a complete
   row wins as a whole — the browser and the server always see the same key.

## Non-goals

- No change of the chain of §11.1: the presence of the channel in the chain is
  still read from the environment, only the **values** come from the effective
  configuration now.
- No change of the `enabled` flag of the row for the send: the chain decides
  whether the channel sends at all.
- No new error code and no new text: a send that fails names its cause in
  WP-M14-159.
- No change of the subscription store, of the routes and of the service worker.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new assertions fail before the change and pass after it.

## Handoff

- Files changed: `apps/api/src/notifications/config.ts`,
  `apps/api/src/notifications/web-push-subscriptions.ts`,
  `apps/api/src/notifications/channels/index.ts`, the integration test,
  `specs/10-notifications.md` §11.2, `CHANGELOG.md`, `docs/REPO-MAP.md`,
  `work-packages/README.md`
- Interfaces added: `webPushTrio`, `readWebPushConfiguration` — the VAPID trio
  is one value
- Verified: `npm run typecheck`, `npm run lint`, `npm run test:run`,
  `npm run i18n:check`, `npm run wp:check`
- Follow-up WP: WP-M14-171 — a failing web push names its cause
- Open question: none
