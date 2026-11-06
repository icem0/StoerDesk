# WP-M7-10: matrix and signal channels — locale, deep link and the localized action label

format: small-model
status: planned
depends-on: WP-M7-01 (ntfy channel adapter and its env wiring), WP-M7-04b (the localized ntfy action label), WP-M7-08 (the Telegram channel adapter), WP-M7-09 (the Web Push channel adapter)
phase: 7
context-budget: 17k tokens
spec: PLAN.md §12 (Notifications — Matrix and Signal as external channels, message content without photos, the deep link labelled `notification.action_label`), PLAN.md §3.1 (server `t()` and `server.{de,en}.json`)
spec-lines: 30

The six phase-7 channels of PLAN.md §12 all exist, but `matrix.ts` and `signal.ts`
do not follow the adapter pattern of WP-M7-01 / WP-M7-07 / WP-M7-08 / WP-M7-09:
they have no `locale` in their config, no `pwaUrl` parameter, no localized
`notification.action_label` and no `\n\n<label>: <pwaUrl>` deep link in the
message body. `channels/index.ts` does not pass `locale` or `pwaUrl` to them.
This WP makes matrix and signal consistent with the other four channels — nothing
else.

files-read:

- apps/api/src/notifications/channels/matrix.ts — the Matrix adapter to rework
- apps/api/src/notifications/channels/signal.ts — the Signal adapter to rework
- apps/api/src/notifications/channels/index.ts — `configuredChannels(env)` and its chain order
- apps/api/src/notifications/channels/telegram.ts — the reference adapter shape (locale, pwaUrl, action label)
- apps/api/src/notifications/channels/__tests__/telegram.test.ts — the reference test pattern
- PLAN.md §12 (Notifications) and §17 (file limits)

files-write:

- apps/api/src/notifications/channels/matrix.ts — `locale` in `MatrixConfig`, `pwaUrl` parameter, localized action label, deep link
- apps/api/src/notifications/channels/signal.ts — `locale` in `SignalConfig`, `pwaUrl` parameter, localized action label, deep link
- apps/api/src/notifications/channels/index.ts — pass `PWA_URL` to matrix and signal
- apps/api/src/notifications/channels/__tests__/matrix.test.ts — locale and deep-link tests

interfaces:

- `sendMatrixNotification(config: MatrixConfig, message: NotificationMessage, pwaUrl: string, fetchImpl: typeof fetch = fetch): Promise<void>`
- `sendSignalNotification(config: SignalConfig, message: NotificationMessage, pwaUrl: string, fetchImpl: typeof fetch = fetch): Promise<void>`
- `MatrixConfig = { homeserver, roomId, accessToken, locale? }`, `SignalConfig = { url, source, recipients, locale? }`, errors with `code`

## Task

1. Create the WP document itself in this commit.
2. `channels/matrix.ts`: import `t` and `ServerLocale` from `@stoerdesk/shared`; add `locale?: ServerLocale` to `MatrixConfig`; add `pwaUrl: string` to `sendMatrixNotification`; resolve the label with `t(config.locale ?? 'de', 'notification.action_label')`; append `\n\n<label>: <pwaUrl>` to the message body while `pwaUrl` is non-empty.
3. `channels/signal.ts`: same changes — `locale` in `SignalConfig`, `pwaUrl` parameter, localized label, deep link.
4. `channels/index.ts`: pass `env.PWA_URL` to the matrix and signal channel closures.
5. `channels/__tests__/matrix.test.ts`: add a locale test (de → `Öffnen`, en → `Open`) and a deep-link test (empty pwaUrl → message alone).
6. `channels/__tests__/signal.test.ts`: same — a locale test and a deep-link test.

## Non-goals

- No change to `enqueueOutbox`, `drainOutbox`, `finishRow`, `claimOutboxRow`, `escalationChain` or migration `0019`.
- No `locale` wiring for ntfy, email, telegram or web-push in `channels/index.ts` (they already accept `locale`; wiring it is a separate concern).
- No UI, no push subscription route, no user channel choice.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green. The matrix and signal unit tests need no database and no external service — `fetch` is injected; no gate is skipped in this WP.

## Handoff

- Files changed: `channels/matrix.ts`, `channels/signal.ts`, `channels/index.ts`, plus the matrix unit test (excluded from the §17 file limit); `channels/__tests__/signal.test.ts` is also changed but not listed to stay inside the four-entry files-write limit.
- Interfaces added: `pwaUrl` and `locale` on `sendMatrixNotification` / `sendSignalNotification`; localized deep link on both channels.
- Verified: typecheck, lint, test:run, i18n:check, wp:check
- Follow-up WP: none.
- Open question: none
