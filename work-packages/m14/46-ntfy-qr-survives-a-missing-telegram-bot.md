# WP-M14-46: The ntfy QR survives a missing Telegram bot

format: small-model
status: done
depends-on: WP-M14-13
phase: 14
milestone: m14
context-budget: 12k tokens
spec: specs/10-notifications.md §11.3, §11.12
spec-lines: 20

files-read:

- specs/10-notifications.md §11.3, §11.12
- apps/web/src/settings/notifications-page.tsx (the early return)
- apps/web/src/features/settings/NtfySubscription.tsx (the QR card)
- apps/api/src/notifications/routes.ts (the Telegram code route)

files-write:

- apps/api/src/notifications/routes.ts
- apps/web/src/settings/{notifications-page.tsx,__tests__/notifications-page.test.tsx}
- apps/web/src/features/settings/NtfySubscription.tsx
- apps/web/src/i18n/locales/{de,en}/common.json

interfaces:

- `POST /api/v1/notifications/accounts/telegram/code` answers `503
  channel_not_configured` instead of an unhandled `500` when the bot token is
  missing

## Task

1. The own channels page renders its sections even when the Telegram code
   request fails. A missing Telegram bot is inline text in the Telegram section,
   never a replacement of the whole page — the ntfy subscription of WP-M14-13
   must stay visible and scannable.
2. The ntfy card shows the subscription address as selectable text next to the
   QR and the hint that ntfy has to be selected for the events of §11.4.
3. An answer of the ntfy route without a public server shows an explanatory
   text instead of an empty area.
4. A regression test proves that a `503 channel_not_configured` of the Telegram
   route still renders the ntfy QR and the address.

## Non-goals

- No change of the Telegram linking flow, the account store or the selection
  API.
- No change of the ntfy adapter or the outbox.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the QR of the user renders with a 503 Telegram answer and
the address is readable.

## Handoff

- Files changed: the Telegram code route, the own channels page, the ntfy card
  and the two locales.
- Interfaces added: the `503 channel_not_configured` of the Telegram code route.
- Verified: `npm run check` and `npm run build`.
- Follow-up WP: WP-M14-21 — the exit criterion of the phase
- Open question: none
