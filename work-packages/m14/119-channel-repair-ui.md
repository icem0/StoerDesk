# WP-M14-119: channel repair UI — test with direct feedback and lastError visible

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 25k tokens
spec: specs/10-notifications.md §11.8, §11.13; PLAN.md §12
spec-lines: 20

depends-on: WP-M14-118, WP-M14-19, WP-M14-47

files-read:

- apps/web/src/admin/channels-page.tsx (failing channel list, test mutation)
- apps/web/src/settings/notifications-page.tsx (own channels page)
- apps/web/src/i18n/locales/{de,en}/settings.json (admin.channels.* and notifications.* keys)
- apps/api/src/dashboard/service.ts (resolveChannelStatus — lastError from WP-M14-118)
- packages/shared/src/schemas/notification.ts (channelStatusItemSchema — lastError from WP-M14-118)

files-write:

- apps/web/src/admin/channels-page.tsx
- apps/web/src/settings/notifications-page.tsx
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json

interfaces:

- `GET /api/v1/notifications/status` returns `lastError` per channel (WP-M14-118) — the UI now shows it translated next to the failing channel
- The test-send button on each channel card keeps sending to the saved configuration; a failure now names the translated reason inline
- On `/settings/notifications`, a user can test their own ntfy subscription with a test message that carries the user's topic; the answer shows `delivered` or the translated failure code

## Task

1. In `ChannelsPage` (`apps/web/src/admin/channels-page.tsx`), extend the failing-channel list (WP-M14-19 section) with the translated `lastError` of each failing channel — the machine code becomes a readable explanation via `t('admin.channels.errors.<code>')`, unknown codes stay visible as the code itself.
2. On the channel card of `/admin/channels`, keep the existing test button but make its failure state a clearly separated inline alert that names the translated reason and links to the administration hint ("Konfiguration prüfen" / "Token speichern" / "Verifizieren").
3. In `NotificationsPage` (`apps/web/src/settings/notifications-page.tsx`), add a test button to the ntfy section that posts a test message to the user's own topic via `POST /v1/admin/channels/ntfy/test` with `{ topic }` override (WP-M14-11 test route), showing `delivered` or the translated failure inline.
4. Add i18n keys `admin.channels.repair.*` (de/en) for the repair button label and the translated-reason hint; add `notifications.ntfy.test*` keys (de/en) for the own-topic test button.
5. Add a unit test that proves the failing-channel list renders `lastError` translated; add a unit test that proves the own-ntfy-test button calls the route with the user's topic and shows the result.

## Non-goals

- No new API endpoint — the existing test route with `{ topic }` override is reused.
- No alarm bell yet (that is WP-M14-120).
- No change of the worker, retries, or fallback chain.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the failing-channel list shows the translated `lastError`; the test button on a failing channel shows the translated reason inline; the own-ntfy-test on `/settings/notifications` works.

## Handoff

- Files changed: `channels-page.tsx`, `notifications-page.tsx`, both settings locale files, the WP file
- Interfaces added: translated `lastError` in failing list, own-ntfy-test on settings page
- Verified: `npm run check`, `npm run build`
- Follow-up WP: WP-M14-120 — alarm bell / visible alert on the page when a channel fails
- Open question: none
