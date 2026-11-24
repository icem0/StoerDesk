# WP-M24-08: the code over the channel confirms the account

format: small-model
status: planned
depends-on: WP-M24-05
phase: 24
milestone: m24
context-budget: 16k tokens
spec: specs/10-notifications.md §11.3a, §11.11, §11.13
spec-lines: 30

files-read:

- apps/api/src/notifications/verification.ts (the confirmation of the target of the instance)
- apps/api/src/notifications/telegram-linking.ts (the one-time code of the Telegram bot)
- apps/api/src/notifications/accounts.ts (the accounts of the user)

files-write:

- apps/api/src/notifications/verification.ts
- apps/api/src/notifications/routes.ts
- apps/api/src/notifications/__tests__/verification.integration.spec.ts

interfaces:

- `POST /api/v1/notifications/accounts/:channel/verification` — sends the one-time code over the channel of the account
- `POST /api/v1/notifications/accounts/:channel/verification/confirm` — confirms the account with the code
- `notification_accounts.verified_at` — the time of the confirmation

## Task

1. Write the confirmation of an account of a user: the code (six characters,
   ten minutes, used once) travels over the channel of the account, the user
   enters it and the account becomes *set up* (`verified_at`).
2. Add the two routes of §11.11 behind the session of the user.
3. Write the test: a wrong code, an expired code and a code of another user are
   refused with `422 invalid_request`.

The way the code reaches the user is the work of the channels themselves —
WP-M24-09 (e-mail), WP-M24-10 (Matrix), WP-M24-11 (Telegram), WP-M24-12 (ntfy),
WP-M24-13 (Web Push) and WP-M24-14 (WhatsApp Web).

## Non-goals

- No change of the adapters.
- No UI.
- No delivery over the channels of the user — WP-M24-06.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the test proves the refusal of a wrong and of an expired
code.

## Handoff

- Files changed: the confirmation, the routes, the test
- Interfaces added: the two routes of the confirmation
- Verified: the commands above
- Follow-up WP: WP-M24-09 — the e-mail channel with the recipient and the HTML body
- Open question: none
