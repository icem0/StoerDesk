# WP-M14-68: Every notification message links to its ticket

format: small-model
status: done
depends-on: WP-M7-04b, WP-M14-07, WP-M14-45
phase: 14
milestone: m14
context-budget: 10k tokens
spec: specs/10-notifications.md §11.5; PLAN.md §12
spec-lines: 10

files-read:

- specs/10-notifications.md §11.5
- apps/api/src/notifications/channels/index.ts
- apps/api/src/notifications/outbox.ts
- apps/api/src/notifications/__tests__/outbox-worker.unit.spec.ts

files-write:

- apps/api/src/notifications/channels/index.ts
- apps/api/src/notifications/outbox.ts
- apps/api/src/notifications/__tests__/outbox-worker.unit.spec.ts
- work-packages/m14/68-every-notification-links-to-its-ticket.md

interfaces:

- `NotificationChannel.send(message, options?: { topic?: string, deepLink?: string })`
  — `options.deepLink` is the link of this message, the PWA root stays the fallback
- `ticketDeepLink(pwaUrl, ticketNo)` — `<pwa-url>/tickets/<ticket-no>` or `''`

## Task

The office asked that every sent message — Telegram, ntfy and the other
channels — carries the link to the ticket it is about. §11.5 already demands
"the deep link into the ticket", but every adapter linked `env.PWA_URL`: the
root of the PWA, not the ticket.

1. `channels/index.ts`: `NotificationChannel.send` gains the optional
   `deepLink` of its `options`; every channel closure passes it to its adapter
   and uses `options?.deepLink ?? env.PWA_URL` as the link — the ntfy `view`
   action and the `<label>: <url>` deep link of the text channels move over
   unchanged.
2. `outbox.ts`: `ticketDeepLink(pwaUrl, ticketNo)` builds
   `<pwa-url>/tickets/<encodeURIComponent(ticket-no)>` (trailing slashes of the
   PWA url collapsed, `''` without a PWA url or without a ticket number);
   `drainOutbox` hands it to `channel.send` as `deepLink` next to the topic
   override, so the fallback row of §12 carries the same link.
3. Drain unit tests: the ntfy body of a drained row names the action url
   `<pwa>/tickets/ST-2026-0001` and the telegram text carries
   `<label>: <pwa>/tickets/ST-2026-0001`.

## Non-goals

- No link to a token, no `status_token`, no contact data in the link — the
  ticket number only (as in WP-M14-22); the readiness link to `/oncall` (ADR-0021)
  stays with WP-M14-28.
- The adapters keep their signatures; no payload field is added to ntfy.
- No new i18n key, no migration, no new route, no environment key.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run --workspace @stoerdesk/api
npm run i18n:check
npm run wp:check
```

## Handoff

- Files changed: the channel registry, the drain, its unit spec, this document.
- Interfaces added: `deepLink` in the send options, `ticketDeepLink` in `outbox.ts`.
- Verified: api unit tests green; the ntfy and telegram drain tests assert the
  ticket link.
- Follow-up WP: none.
- Open question: none.
