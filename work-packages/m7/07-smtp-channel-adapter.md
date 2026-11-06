# WP-M7-07: the e-mail channel adapter over SMTP

format: small-model
status: implemented
depends-on: WP-M7-01 (ntfy channel adapter and its env wiring), WP-M7-04c (the outbox drain worker and its schedule), WP-M7-05 (the notification channel fallback chain)
phase: 7
context-budget: 16k tokens
spec: PLAN.md §12 (Notifications — "E-mail (SMTP): external mail server, fallback and escalation", "3 retries with backoff, then the next channel in the escalation chain", message content without photos), PLAN.md §16 (phase 7 "Notifications: outbox, worker, Web Push, ntfy, Matrix, Signal, SMTP, Telegram")
spec-lines: 20

`PLAN.md` §12 lists e-mail as one of the external channels and `docs/REPO-MAP.md`
still marks it as planned; the `SMTP_*` keys are already part of the environment
(WP-M1-02) and migration `0019` has no e-mail specific row shape. WP-M7-01 … WP-M7-05
built the adapter pattern, the drain, the retries and the chain of
`configuredChannels(env)` order. This WP adds the fourth channel to that chain —
nothing else. The transport is `nodemailer` (ADR-0009): the plan fixes no SMTP
library and a hand-written STARTTLS client is not an option.

files-read:

- apps/api/src/notifications/channels/ntfy.ts — the adapter shape, its injectable last parameter and the localized `notification.action_label` (WP-M7-01, WP-M7-04b)
- apps/api/src/notifications/channels/index.ts — `configuredChannels(env)` and its chain order (signal → matrix → ntfy)
- apps/api/src/notifications/channels/matrix.ts — an adapter that needs no deep link argument
- apps/api/src/notifications/channels/__tests__/ntfy.test.ts — the mock-injection pattern of a channel unit test (WP-M7-02, WP-M7-04b)
- apps/api/src/config/env.ts — the `SMTP_HOST`/`SMTP_PORT`/`SMTP_SECURE`/`SMTP_USER`/`SMTP_PASSWORD`/`SMTP_FROM` keys and `PWA_URL`
- PLAN.md §12 (Notifications) and §17 (file limits)

files-write:

- apps/api/src/notifications/channels/email.ts — the SMTP adapter
- apps/api/src/notifications/channels/index.ts — the `email` entry of `configuredChannels`
- apps/api/package.json — the `nodemailer` dependency (ADR-0009)
- apps/api/src/notifications/channels/__tests__/email.test.ts — the channel unit test

interfaces:

- `sendEmailNotification(config: EmailConfig, message: NotificationMessage, pwaUrl: string, createTransportImpl: typeof createTransport = createTransport): Promise<void>`
- `EmailConfig = { host, port, secure, user, password, from, locale? }`, `EmailError` with the codes `no_sender` and `send_failed`
- `configuredChannels(env)` gains the `email` entry, configured when `SMTP_HOST` and `SMTP_FROM` are both set; the escalation chain order becomes signal → matrix → ntfy → email

## Task

1. `apps/api/package.json`: add `"nodemailer": "^10.3.1"` to the dependencies of `@stoerdesk/api`
   (install it so the lockfile records it; `apps/api` bundles with `--packages=external`, so the
   runtime dependency stays in the image's `node_modules`).
2. `channels/email.ts`: mirror the ntfy adapter — `EmailConfig`, `NotificationMessage`,
   `EmailError` with a `code`. `sendEmailNotification` throws `no_sender` when `config.from` is
   empty, otherwise builds the transport with `createTransportImpl({ host, port, secure, auth? })`
   (no `auth` block while `config.user` is empty) and calls `sendMail({ from, subject: message.title,
   text })` where `text` is the body plus — only when `pwaUrl` is non-empty — a `\n\n<actionLabel>: <pwaUrl>`
   deep-link line labelled `t(locale ?? 'de', 'notification.action_label')`. A rejected `sendMail`
   becomes `EmailError('send_failed', error.message)`; the password never enters the message.
3. `channels/index.ts`: add the `email` channel after ntfy — a `await import('./email.js')` closure
   like the others, `name: 'email'`, configured only when `SMTP_HOST !== ''` and `SMTP_FROM !== ''`.
   `escalationChain` and `drainOutbox` need no change: both read `configuredChannels`.
4. `channels/__tests__/email.test.ts` on the ntfy mock pattern: assert the transport options
   (`host`, `port` 587 `secure: false`, `auth` pair), the TLS variant (465, `secure: true`), no
   `auth` key without a user, the send payload (`from`, `subject`, `text`), the localized deep-link
   label in `de` and `en`, the body alone while `pwaUrl` is empty, `no_sender` without a sender
   (transport never created) and `send_failed` with code and message on a rejecting `sendMail`.
5. Docs: `docs/REPO-MAP.md` (email.ts row, tree comment, index row), `docs/DECISIONS.md` plus
   `docs/DECISIONS/0009-smtp-over-nodemailer.md`, `PLAN.md` §16 (backlog row, current state) and
   §19 (technical default), `work-packages/README.md` (phase-7 row, backlog row, status prose),
   `CHANGELOG.md`, one `.env.example` comment line.

## Non-goals

- No Telegram or Web Push (VAPID) adapter, no `push_subscriptions` route — other channels keep their
  own WP.
- No user choice of channels per event type and no mandatory minimum channel for `critical`
  (`PLAN.md` §12 admin rule, §5 RBAC) and no admin channel registry route: `configuredChannels`
  stays environment-driven.
- No dashboard tile or admin warning on channel failure (`PLAN.md` §12/§13, phase 9).
- No HTML mail, no attachments, no photo; no change to `enqueueOutbox`, `drainOutbox`, `finishRow`
  or the migration-`0019` row shape.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green. The unit test needs no database and no mail server — the transport factory is
injected, so the real `nodemailer` transport is never reached; no gate is skipped in this WP.

## Handoff

- Files changed: `channels/email.ts` (new adapter), `channels/index.ts` (the `email` entry),
  `apps/api/package.json` (`nodemailer`), plus the unit test (excluded from the file limit of §17) and
  the repository bookkeeping (`docs/REPO-MAP.md`, `docs/DECISIONS.md` + ADR-0009, `PLAN.md` §16/§19,
  `work-packages/README.md`, `CHANGELOG.md`, `.env.example`).
- Interfaces added: `sendEmailNotification`, `EmailConfig`, `EmailError`, the `email` entry of
  `configuredChannels` (chain position last).
- Verified: typecheck, lint, test:run, i18n:check, wp:check
- Follow-up WP: none
- Open question: none
