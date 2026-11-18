# WP-M14-118: notification channel diagnosis and repair

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 25k tokens
spec: specs/10-notifications.md §11.8, §11.13; PLAN.md §12
spec-lines: 25

depends-on: WP-M14-19, WP-M14-47, WP-M14-50

files-read:

- apps/api/src/notifications/outbox.ts (catch block writes notification_failed)
- apps/api/src/dashboard/service.ts (resolveChannelStatus)
- apps/api/src/notifications/routes.ts (GET /api/v1/notifications/status)
- packages/shared/src/schemas/notification.ts (channel status contract)
- apps/web/src/admin/channels-page.tsx (failing channel list)
- apps/web/src/i18n/locales/{de,en}/settings.json

files-write:

- apps/api/src/notifications/outbox.ts
- apps/api/src/dashboard/service.ts
- packages/shared/src/schemas/notification.ts
- work-packages/m14/118-notification-channel-diagnosis-and-repair.md

interfaces:

- `notification_failed` event payload gains `errorCode` (`http_401`, `http_timeout`, `channel_unconfigured`, …) next to `channel`, `ticketNo` and `attempts`
- `GET /api/v1/notifications/status` gains `lastError` per channel (the machine code of the last failure, empty when the last attempt succeeded)
- The ntfy test send and the verification send keep their `{ delivered, code }` answer; the code is now also stored as `lastError`

## Task

1. In `drainOutbox` (`apps/api/src/notifications/outbox.ts`), capture the adapter error code in the `catch` branch and hand it to `finishRow`; `finishRow` stores it on the `outbox` row as `lastError` (nullable) and puts it into the `notification_failed` event payload as `errorCode`.
2. Add a `lastError` column to `notification_status` (`resolveChannelStatus` in `apps/api/src/dashboard/service.ts`) so `GET /api/v1/notifications/status` answers the last error code of every channel.
3. Extend `channelStatusListResponseSchema` / `ChannelStatusListResponse` in `packages/shared/src/schemas/notification.ts` with `lastError?: string`.
4. Add i18n keys `admin.channels.errors.*` (de/en) for the most frequent codes (`http_401`, `http_403`, `http_timeout`, `channel_unconfigured`, `send_failed`) so the UI can translate a machine code into an explanation instead of showing "Zustellung gestört".
5. Add a unit test that proves `lastError` is stored on a failed row and returned by the status route; add an integration test that proves the status route returns `lastError` for a channel whose drain ended `FAILED`.

## Non-goals

- No UI repair dialog in this WP — that is WP-M14-119 ("repair button on the channels page").
- No new channel, no new retry logic, no change of the fallback chain.
- No history table beyond the existing `outbox` rows and `ticket_events`.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; `GET /api/v1/notifications/status` returns `lastError` per channel, and the `notification_failed` event carries `errorCode`.

## Handoff

- Files changed: `outbox.ts`, `dashboard/service.ts`, `packages/shared/src/schemas/notification.ts`, the WP file
- Interfaces added: `errorCode` on the `notification_failed` payload, `lastError` on the channel status
- Verified: `npm run check`, `npm run build`
- Follow-up WP: WP-M14-119 — repair button (test-send with feedback, token re-entry, re-verification) on `/admin/channels` and `/settings/notifications`
- Open question: none
