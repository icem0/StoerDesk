# WP-M24-06b: the channels send to the target of the user

format: small-model
status: done
depends-on: WP-M24-06a
phase: 24
milestone: m24
context-budget: 16k tokens
spec: specs/10-notifications.md §11.1, §11.4, §11.7, ADR-0045
spec-lines: 30

files-read:

- apps/api/src/notifications/channels/index.ts (the registry and the chain)
- apps/api/src/notifications/channels/email.ts (the mail without a recipient)
- apps/api/src/notifications/channels/__tests__/email.test.ts (the test of the adapter)

files-write:

- apps/api/src/notifications/channels/index.ts
- apps/api/src/notifications/channels/email.ts
- apps/api/src/notifications/channels/__tests__/email.test.ts

interfaces:

- `MessageOptions.recipientTarget` — the address of the user at the channel
- `MessageOptions.recipientSecret` — the write-only secret of the account of the user
- `MessageOptions.userId` — the id of the user
- `EmailConfig.to` — the recipients of the mail

## Task

1. Give the registry the target of the user: the chat of the user for Telegram
   and WhatsApp Web, the room and the homeserver of the user for Matrix (with
   his token), the address of the user for the e-mail. Without the target the
   send goes to the target of the installation — the fallback of §11.7.
2. Give the e-mail adapter the recipients it never had: a mail without a
   recipient is refused with `no_recipient` — a mail nobody receives is not a
   delivery.
3. Write the test of the refusal.

## Non-goals

- No change of the queue — WP-M24-06c writes the target of the user into the row.
- No HTML body — WP-M24-09.
- No change of the other adapters: they take their target in their config.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the mail without a recipient is refused.

## Handoff

- Files changed: the registry, the adapter of the e-mail, the test of the adapter
- Interfaces added: the three options of the target, the recipients of the mail
- Verified: the commands above
- Follow-up WP: WP-M24-06c — the delivery goes over the channels of the user
- Open question: none
