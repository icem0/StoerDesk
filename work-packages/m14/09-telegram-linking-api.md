# WP-M14-09: The Telegram account linking via a one-time code

format: small-model
status: planned
depends-on: WP-M14-08
phase: 14
milestone: m14
context-budget: 24k tokens
spec: specs/10-notifications.md §11.3, §11.11; PLAN.md §12
spec-lines: 40

files-read:

- specs/10-notifications.md §11.3, §11.11
- apps/api/src/notifications/accounts.ts (the service of WP-M14-08)
- apps/api/src/notifications/channels/telegram.ts (the adapter)
- apps/api/src/config/env.ts (the keys of the bot)
- apps/api/src/settings/branding.ts (a settings row)

files-write:

- apps/api/src/notifications/telegram-linking.ts
- apps/api/src/notifications/routes.ts
- packages/shared/src/schemas/notification.ts

interfaces:

- `POST /api/v1/notifications/accounts/telegram/code` — a one-time code
- `POST /api/v1/notifications/accounts/telegram` — the code is checked
- `createTelegramCode(database, env)`, `redeemTelegramCode(database, env, code)`

## Task

1. `apps/api/src/notifications/telegram-linking.ts` creates a one-time code
   (six characters, ten minutes, used once) and stores it with its deadline in
   the settings row `notifications.telegram.code` — the row is write-only and
   never answered.
2. The redemption reads the pending updates of the bot
   (`getUpdates` with the offset of the instance), matches the code and reads
   the chat id of the message; the account of the user is stored with that
   chat id. A wrong, expired or unknown code answers `422 invalid_request`.
3. The routes of §11.11 are added to `apps/api/src/notifications/routes.ts`
   behind the session; the code is bound to the user who asked for it.
4. The bot token never appears in an answer, a log or an error message.

## Non-goals

- No page — the Telegram section of the settings page is WP-M14-10.
- No webhook of the bot: the exchange reads the updates, so no inbound route
  and no public address are needed.
- No change of the adapter of the channel.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the test with a mocked Bot API exchanges a code for a
chat id, an expired code is refused and the token never leaves the API.

## Handoff

- Files changed: the new linking module, the routes, the shared contracts and
  the tests
- Interfaces added: the two routes of the Telegram linking
- Verified: `npm run check`
- Follow-up WP: WP-M14-10 — the Telegram section of the settings page
- Open question: none
