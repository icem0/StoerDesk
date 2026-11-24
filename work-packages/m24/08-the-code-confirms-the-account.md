# WP-M24-08: the code over the channel confirms the account

format: small-model
status: done
depends-on: WP-M24-07
phase: 24
milestone: m24
context-budget: 18k tokens
spec: specs/10-notifications.md §11.3a, §11.11, §11.13
spec-lines: 30

files-read:

- apps/api/src/notifications/verification.ts (the confirmation of the target of the instance)
- apps/api/src/notifications/telegram-linking.ts (the one-time code of the Telegram bot)
- apps/api/src/notifications/accounts.ts (the accounts of the user)

files-write:

- apps/api/src/notifications/confirmation.ts
- apps/api/src/notifications/routes.ts
- apps/api/src/notifications/__tests__/confirmation.integration.spec.ts

interfaces:

- `POST /api/v1/notifications/accounts/:channel/verification` — sends the one-time code over the channel of the account
- `POST /api/v1/notifications/accounts/:channel/verification/confirm` — confirms the account with the code
- `requestChannelConfirmation(database, env, userId, channel, locale)` — sends the code and answers the deadline
- `confirmChannelConfirmation(database, userId, channel, code)` — checks the code and confirms the account

## Task

1. Write the confirmation of an account of a user: the code (six characters,
   ten minutes, used once) travels over the channel of the account — the topic,
   the chat, the room, the mail address, the bridge, the push — and the user
   enters it in his own page.
2. Add the two routes of §11.11 behind the session of the user.
3. Write the test: the code reaches the topic of the account, a wrong code is
   refused and the right one confirms the account — the answer of the accounts
   then names the state `ready`.

## Non-goals

- No UI — WP-M24-16.
- No change of the adapters.
- No compliance of the users — WP-M24-15.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the test proves the refusal of a wrong code and the
confirmation of the account with the right one.

## Handoff

- Files changed: the confirmation, the routes, the test
- Interfaces added: the two routes of the confirmation
- Verified: the commands above
- Follow-up WP: WP-M24-09 — the e-mail account and the target of the user
- Open question: none
