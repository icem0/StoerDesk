# WP-M7-09: the Web Push (VAPID) channel adapter over the push subscription store

format: small-model
status: implemented
depends-on: WP-M7-01 (ntfy channel adapter and its env wiring), WP-M7-04 (the notification outbox and its row shape), WP-M7-04c (the outbox drain worker and its schedule), WP-M7-05 (the notification channel fallback chain), WP-M7-08 (the Telegram channel adapter, newest chain position)
phase: 7
context-budget: 17k tokens
spec: PLAN.md §12 (Notifications — "Web Push (VAPID): for installed PWAs; iOS 16.4+ only in Safari after 'add to home screen'", "3 retries with backoff, then the next channel in the escalation chain", message content without photos), PLAN.md §6 (`push_subscriptions` rows), PLAN.md §16 (phase 7 "Notifications: outbox, worker, Web Push, ntfy, Matrix, Signal, SMTP, Telegram")
spec-lines: 22

`PLAN.md` §12 names Web Push (VAPID) as the last channel of phase 7 and §16 lists it in
the content of that phase; the `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`
keys are already part of the environment (WP-M1-02) and migration `0019` already stores
the subscriptions in `push_subscriptions` (`endpoint`, `p256dh`, `auth`) — rows only, no
route yet (WP-M7-04). WP-M7-01 … WP-M7-08 built the adapter pattern, the drain, the
retries and the chain of `configuredChannels(env)` order (signal → matrix → ntfy → email
→ telegram). This WP adds the sixth channel — nothing else. The transport is the `web-push`
library (ADR-0010): the plan fixes no library and the message content of §12 has to
travel encrypted (payload encoding plus a VAPID JWT), which plain `fetch` cannot build.

files-read:

- apps/api/src/notifications/channels/telegram.ts — the newest adapter shape: config from env keys, error with a `code`, injectable last parameter, the localized deep-link label
- apps/api/src/notifications/channels/index.ts — `configuredChannels(env)` and its chain order
- apps/api/src/notifications/outbox.ts — how `drainOutbox` calls `channel.send(message)` and retries a row
- apps/api/src/db/schema.ts — the `pushSubscriptions` columns of migration 0019
- apps/api/src/config/env.ts — the `VAPID_*` keys, `databaseConnectionUrl(env)` and `PWA_URL`
- PLAN.md §12 (Notifications) and §17 (file limits)

files-write:

- apps/api/src/notifications/channels/web-push.ts — the VAPID adapter over the `web-push` library
- apps/api/src/notifications/channels/index.ts — the `webpush` entry of `configuredChannels`
- apps/api/package.json — the `web-push` and `@types/web-push` dependencies (ADR-0010)
- apps/api/src/notifications/channels/__tests__/web-push.test.ts — the channel unit test

interfaces:

- `sendWebPushNotification(config: WebPushConfig, message: NotificationMessage, pwaUrl: string, subscriptions: WebPushSubscription[], sendImpl: typeof webPush.sendNotification = webPush.sendNotification): Promise<void>`
- `WebPushConfig = { publicKey, privateKey, subject, locale? }`, `WebPushSubscription = { endpoint, p256dh, auth }`, `WebPushError` with the codes `no_keys` and `send_failed`
- `configuredChannels(env)` gains the `webpush` entry — configured only when all three `VAPID_*` keys are set — appended last, so the escalation chain becomes signal → matrix → ntfy → email → telegram → webpush

## Task

1. Create the WP document itself in this commit.
2. `apps/api/package.json`: add `"web-push": "^3.6.7"` and `"@types/web-push": "^3.6.4"` to the
   dependencies of `@stoerdesk/api` (ADR-0010; `apps/api` bundles with `--packages=external`,
   so both resolve in the image's `node_modules`).
3. `channels/web-push.ts`: mirror the telegram adapter — `WebPushConfig` from the three `VAPID_*`
   keys plus the optional `locale`, `NotificationMessage`, `WebPushSubscription`, `WebPushError`
   with a `code`. `sendWebPushNotification` throws `no_keys` while any of the three keys is empty
   (no request), otherwise sends the payload text — `${title}\n${body}` plus a `\n\n<label>:
   <pwaUrl>` deep-link line labelled `t(locale ?? 'de', 'notification.action_label')` only while
   `pwaUrl` is non-empty — to every subscription through
   `sendImpl({ endpoint, keys: { p256dh, auth } }, text, { vapidDetails: { subject, publicKey, privateKey } })`.
   A rejected send becomes `WebPushError('send_failed', …)` with the push-service status when the
   library carries one; the endpoint, the `p256dh`/`auth` pair and the private key never enter the
   message. An empty subscription list sends nothing and succeeds.
4. `channels/index.ts`: add the `webpush` entry after telegram — the closure opens its own
   short-lived pool (the `configuredChannels(env)` signature only carries the environment) and
   reads the `push_subscriptions` rows of migration `0019` as `{ endpoint, p256dh, auth }`, then
   calls the adapter; `name: 'webpush'`, configured only when all three keys are non-empty.
   `enqueueOutbox`, `drainOutbox`, `finishRow`, `claimOutboxRow` and `escalationChain` need no
   change: they read `configuredChannels`.
5. `channels/__tests__/web-push.test.ts` on the mock-injection pattern of the telegram test: the
   payload text and the VAPID options of one subscription, the localized deep-link label in `de`
   and `en`, the payload alone while `pwaUrl` is empty, one call per subscription (two
   subscriptions), `no_keys` with no call while a key is empty, `send_failed` with the status on a
   rejecting send and the empty subscription list as a no-op.
6. Docs: `docs/REPO-MAP.md` (tree comment, index row, web-push row), `docs/DECISIONS.md` plus
   `docs/DECISIONS/0010-web-push-over-the-web-push-library.md` (ADR-0010), `PLAN.md` §16 (backlog
   row, current state) and §19 (technical default), `work-packages/README.md` (phase-7 row, backlog
   row, status prose), `CHANGELOG.md`.

## Non-goals

- No `push_subscriptions` route and no push registration in the PWA: the rows of migration `0019`
  stay the only source, a service worker that subscribes the visitor is a later WP.
- No user choice of channels per event type, no mandatory minimum channel for `critical`
  (`PLAN.md` §12 admin rule) and no `notification_channels` registry route: `configuredChannels`
  stays environment-driven.
- No dashboard tile and no admin warning on channel failure (`PLAN.md` §12/§13 — phase 9).
- No Telegram account linking, no change to `enqueueOutbox`, `drainOutbox`, `finishRow`,
  `escalationChain` or the migration-`0019` row shape; no new dependency beyond `web-push`.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green. The unit test needs no database and no push service — the sender and the
subscription list are injected, so the real `web-push` transport is never reached; no gate is
skipped in this WP.

## Handoff

- Files changed: `channels/web-push.ts` (new adapter), `channels/index.ts` (the `webpush` entry),
  `apps/api/package.json` (`web-push`, `@types/web-push`), plus the unit test (excluded from the
  file limit of §17) and the repository bookkeeping (`docs/REPO-MAP.md`, `docs/DECISIONS.md` +
  ADR-0010, `PLAN.md` §16/§19, `work-packages/README.md`, `CHANGELOG.md`).
- Interfaces added: `sendWebPushNotification`, `WebPushConfig`, `WebPushSubscription`,
  `WebPushError`, the `webpush` entry of `configuredChannels` (chain position last).
- Verified: typecheck, lint, test:run, i18n:check, wp:check
- Follow-up WP: none — phase 7 names no further channel; the `push_subscriptions` registration
  route stays a later WP.
- Open question: none
