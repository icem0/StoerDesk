# WP-M7-08: the Telegram channel adapter over the Bot API

format: small-model
status: implemented
depends-on: WP-M7-01 (ntfy channel adapter and its env wiring), WP-M7-04c (the outbox drain worker and its schedule), WP-M7-05 (the notification channel fallback chain), WP-M7-07 (the e-mail channel adapter over SMTP)
phase: 7
context-budget: 16k tokens
spec: PLAN.md §12 (Notifications — "Telegram: external bot, account linking via one-time code", "3 retries with backoff, then the next channel in the escalation chain", message content without photos), PLAN.md §16 (phase 7 "Notifications: outbox, worker, Web Push, ntfy, Matrix, Signal, SMTP, Telegram")
spec-lines: 20

`PLAN.md` §12 names Telegram as one of the external channels, the `TELEGRAM_BOT_TOKEN`
and `TELEGRAM_CHAT_ID` keys are already part of the environment (WP-M1-02) and
migration `0019` has no Telegram-specific row shape. WP-M7-01 … WP-M7-07 built the
adapter pattern, the drain, the retries and the chain of `configuredChannels(env)`
order (signal → matrix → ntfy → email). This WP adds the fifth channel — nothing
else. The transport is plain `fetch` over the Telegram Bot API, like the ntfy and
Matrix adapters: no library, no ADR.

files-read:

- apps/api/src/notifications/channels/email.ts — the adapter shape of the newest channel: config, error with a `code`, injectable last parameter, the localized deep-link label (WP-M7-07)
- apps/api/src/notifications/channels/matrix.ts — an HTTP channel that composes `${title}\n${body}` and needs no extra argument
- apps/api/src/notifications/channels/index.ts — `configuredChannels(env)` and its chain order
- apps/api/src/notifications/channels/__tests__/ntfy.test.ts — the fetch-mock pattern of a channel unit test (WP-M7-02)
- apps/api/src/config/env.ts — `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` and `PWA_URL`
- PLAN.md §12 (Notifications) and §17 (file limits)

files-write:

- apps/api/src/notifications/channels/telegram.ts — the Bot-API adapter
- apps/api/src/notifications/channels/index.ts — the `telegram` entry of `configuredChannels`
- apps/api/src/notifications/channels/__tests__/telegram.test.ts — the channel unit test
- docs/REPO-MAP.md — tree comment, index row, telegram row

interfaces:

- `sendTelegramNotification(config: TelegramConfig, message: NotificationMessage, pwaUrl: string, fetchImpl: typeof fetch = fetch): Promise<void>`
- `TelegramConfig = { token, chatId, locale? }`, `TelegramError` with the codes `no_token` and `http_error`
- `configuredChannels(env)` gains the `telegram` entry — configured when `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are both set — appended last, so the escalation chain is signal → matrix → ntfy → email → telegram

## Task

1. Create the WP document itself in this commit.
2. `channels/telegram.ts`: mirror the email adapter — `TelegramConfig`, `NotificationMessage`,
   `TelegramError` with a `code`. `sendTelegramNotification` throws `no_token` when `config.token`
   is empty, otherwise POSTs `https://api.telegram.org/bot<token>/sendMessage` with the JSON body
   `{ chat_id: config.chatId, text }` where `text` is `${message.title}\n${message.body}` plus —
   only when `pwaUrl` is non-empty — a `\n\n<label>: <pwaUrl>` deep-link line labelled
   `t(locale ?? 'de', 'notification.action_label')`. A non-ok response becomes
   `TelegramError('http_error', 'Telegram responded with <status>')`; the token never enters
   the message (no photo, no contact data — `PLAN.md` §12 message content).
3. `channels/index.ts`: add the `telegram` entry after email — a `await import('./telegram.js')`
   closure like the others, `name: 'telegram'`, configured only when both keys are non-empty.
   `escalationChain` and `drainOutbox` need no change: both read `configuredChannels`.
4. `channels/__tests__/telegram.test.ts` on the ntfy mock pattern: assert the endpoint URL and
   the payload (`chat_id`, `text`), the localized deep-link label in `de` and `en`, the message
   alone while `pwaUrl` is empty, `no_token` without a token (fetch never called) and
   `http_error` with the status on a `500` response.
5. Docs: `docs/REPO-MAP.md` (tree comment, index row, telegram row), `PLAN.md` §16 (backlog row,
   current state), `work-packages/README.md` (phase row, backlog row, status prose),
   `CHANGELOG.md`.

## Non-goals

- No Telegram account linking via a one-time code (`PLAN.md` §12) — the channel posts to the
  configured chat; per-user linking is a later WP, as are the user choice of channels per
  event type and the mandatory minimum for `critical`.
- No Web Push (VAPID) adapter and no `push_subscriptions` route; `notification_channels` and
  `push_subscriptions` stay rows only.
- No dashboard tile and no admin warning on channel failure (`PLAN.md` §12/§13 — phase 9).
- No change to `enqueueOutbox`, `drainOutbox`, `finishRow`, `escalationChain` or the
  migration-`0019` row shape; no new dependency — `fetch` is the transport of ntfy and Matrix.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green. The unit test needs no database and no Telegram bot — the `fetch`
implementation is injected, so the real Bot API is never reached; no gate is skipped in this WP.

## Handoff

- Files changed: `channels/telegram.ts` (new adapter), `channels/index.ts` (the `telegram` entry),
  plus the unit test (excluded from the file limit of §17) and the repository bookkeeping
  (`docs/REPO-MAP.md`, `PLAN.md` §16, `work-packages/README.md`, `CHANGELOG.md`).
- Interfaces added: `sendTelegramNotification`, `TelegramConfig`, `TelegramError`, the `telegram`
  entry of `configuredChannels` (chain position last).
- Verified: typecheck, lint, test:run, i18n:check, wp:check
- Follow-up WP: none
- Open question: none
