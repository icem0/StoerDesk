# ADR-0010: Web Push transport via the web-push library

- Status: accepted
- Date: 2026-11-06
- Stakeholders: office, manager, admin, user

## Context

`PLAN.md` §12 lists Web Push (VAPID) as an external notification channel for installed
PWAs and `PLAN.md` §16 names it in the content of phase 7, so WP-M7-09 has to send
through it. The other channel adapters (WP-M7-01 … WP-M7-05, WP-M7-08) reach their
service over `fetch`, because ntfy, Signal, Matrix, Telegram and — through nodemailer,
ADR-0009 — SMTP are services the application talks to. Web Push is different: the
browser subscribes to a push service whose endpoint the application must not call
barely. `PLAN.md` §12 requires a message content (ticket number, priority, object
name, deep link), and the Web Push protocol only delivers that content encrypted: the
payload has to be encoded per RFC 8295 (ECDH over the subscriber's `p256dh` key, the
`auth` secret as HKDF salt, AES-128-GCM) and the request has to carry a VAPID JWT
signed with the EC private key of `VAPID_PRIVATE_KEY`. None of this is expressible
with a plain `fetch` call, and `PLAN.md` §19 fixes no Web Push library.

## Decision

`apps/api` depends on `web-push` (`^3.6.7`, types from `@types/web-push` as a
development dependency). The adapter in `apps/api/src/notifications/channels/web-push.ts`
keeps the shape of the other adapters — a `WebPushConfig` built from the existing
`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` keys plus the optional `locale`
of WP-M7-04b, a `WebPushError` with the codes `no_keys` and `send_failed`, and the
library sender as injectable last parameter so a unit test never reaches a push
service. The recipients are the `push_subscriptions` rows of migration `0019` (WP-M7-04,
rows only, no route): the `webpush` closure of `configuredChannels(env)` opens its own
short-lived pool for that one read, the shape the pg-boss jobs already use. The entry is
appended last, so the escalation chain of WP-M7-05 becomes signal → matrix → ntfy →
email → telegram → webpush.

The message content stays what `outbox.ts` carries: ticket number, priority and object
name plus the deep link labelled `notification.action_label`. No photo, no contact data.
The endpoint, the `p256dh`/`auth` pair and the private key never enter an error message
or a log line.

## Alternatives

- **Hand-written RFC 8295 encoding over `node:crypto` and WebCrypto.** Rejected: it is
  around 200 lines of key agreement, HKDF and AES-GCM framing that no local gate can
  verify — a push service is not part of the stack and no Chromium runs in this
  container, so a wrong byte in the frame would only show up in the field.
- **A payload-less push (no encrypted body).** Rejected: `PLAN.md` §12 fixes the message
  content, and a push without payload cannot carry it.
- **Deferring Web Push to a later phase.** Rejected: `PLAN.md` §16 already lists it in
  the content of phase 7.

## Consequences

- The channel supports the encrypted payload and the VAPID authorization the push
  services of Firefox, Chrome and Safari expect, through one maintained dependency.
- One more runtime dependency in the `api` image; `apps/api` bundles with
  `--packages=external`, so the package resolves in `node_modules` at runtime.
- Sending loops over the subscriptions: a rejected send stops the loop and the outbox
  row stays `PENDING`, so the retries of WP-M7-04c can deliver twice to a subscriber
  that was already notified. A per-subscription outbox row shape would be a later WP.
- Subscriptions only exist once the PWA registers them; the `push_subscriptions`
  registration route stays a later WP, as does the per-event channel choice of §12.
