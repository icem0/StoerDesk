# WP-M7-04b: the localized ntfy action label

format: small-model
status: implemented
depends-on: WP-M7-01 (ntfy adapter), WP-M7-02 (channel test)
phase: 7
context-budget: 12k tokens
spec: PLAN.md §12 (Notifications — channel message), PLAN.md §3.1 (server text through `t()`)
spec-lines: 24

This WP was split from the announced package "the outbox worker and the localized ntfy
action label": draining the outbox with retries and events needs `index.ts` next to
`outbox.ts`, which would exceed the four-file limit of `PLAN.md` §17. The worker moved
to **WP-M7-04c**; this WP keeps the label, which closes the open question of WP-M7-01.

files-read:

- apps/api/src/notifications/channels/ntfy.ts — `NtfyConfig`, the `view` action, the `Öffnen` literal (WP-M7-01)
- apps/api/src/notifications/channels/index.ts — `ntfyChannel` builds `NtfyConfig` from the env (unchanged here)
- packages/shared/src/i18n/t.ts — the server `t()` over `server.{de,en}.json`, `ServerLocale`
- packages/shared/src/i18n/server.de.json — the bundle that gains the key
- apps/api/src/notifications/channels/__tests__/ntfy.test.ts — the WP-M7-02 payload assertions
- PLAN.md §3.1 (`de` default and reference locale, `en` complete)

files-write:

- apps/api/src/notifications/channels/ntfy.ts — `locale` in `NtfyConfig`, label from `t()`
- packages/shared/src/i18n/server.de.json — `notification.action_label`
- packages/shared/src/i18n/server.en.json — `notification.action_label`
- apps/api/src/notifications/channels/__tests__/ntfy.test.ts — the `de` and `en` label

interfaces:

- `NtfyConfig` gains `locale?: ServerLocale` (`'de' | 'en'`, default `de` per `PLAN.md` §3.1)
- the `view` action label is `t(locale, 'notification.action_label')` — no German literal reaches a payload
- `sendNtfyNotification(config, message, pwaUrl, fetch?)` keeps its signature; `configuredChannels(env)` stays unchanged, an unset `locale` stays `de`

## Task

1. `server.de.json` / `server.en.json`: the `notification.action_label` key — German
   reference `Öffnen`, English `Open`. `npm run i18n:check` guards the de/en parity.
2. `ntfy.ts`: `NtfyConfig` gains the optional `locale` of the shared `ServerLocale`; the
   action label of the payload becomes `t(config.locale ?? 'de', 'notification.action_label')`,
   so the hard-coded German literal of WP-M7-01 is gone (`PLAN.md` §3.1).
3. `channels/index.ts` is deliberately untouched: the env carries no channel locale yet and
   building the config keeps its shape; a missing `locale` resolves to the `de` default.
4. Test: extend `ntfy.test.ts` — the default config still answers `Öffnen` and a config with
   `locale: 'en'` answers `Open`; the payload assertion of WP-M7-02 stays otherwise intact.

## Non-goals

- No outbox worker, no retries, no `notification_sent`/`notification_failed` events — WP-M7-04c.
- No channel locale in the environment or in a `settings` row, no per-user channel choice
  (the admin channel registry is a later WP; `Non-goals` of WP-M7-04 stay).
- No Telegram, SMTP, Web Push, Signal or Matrix adapter change — only ntfy has an action label.
- No web UI, no QR card and no `apps/web` namespace change (WP-M7-03 already shipped the card).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; `i18n:check` reports the de/en parity of
`server.notification.action_label`, the extended channel test passes without a database.

## Handoff

- Files changed: `apps/api/src/notifications/channels/ntfy.ts` (the `t()` import,
  `NtfyConfig.locale`, the `actionLabel` helper), `packages/shared/src/i18n/server.de.json`
  and `server.en.json` (the new `notification.action_label` key) and the extended test
  `apps/api/src/notifications/channels/__tests__/ntfy.test.ts` (excluded from the file limit
  of §17); bookkeeping: `CHANGELOG.md`, `PLAN.md` §16, `docs/REPO-MAP.md`, this README backlog
  and the split child `work-packages/m7/04c-outbox-drain-worker.md`
- Interfaces added: `NtfyConfig.locale?: ServerLocale` (`'de' | 'en'`, default `de`), the
  server key `notification.action_label` in `server.{de,en}.json` (`Öffnen` / `Open`) and the
  module-local `actionLabel(config)` that resolves the payload label through the shared `t()`
- Deviation: `apps/api/src/notifications/channels/index.ts` is `files-read` only and stays
  unchanged — the environment carries no channel locale, so `ntfyChannel` still builds
  `{ url, topic }` and the label resolves through the `de` default of §3.1; a per-channel or
  per-user locale belongs to the later channel-registry WP, not here
- Follow-up WP: WP-M7-04c (the outbox drain worker, its retries and its pg-boss schedule —
  its file was created in this commit)
- Open question: none
