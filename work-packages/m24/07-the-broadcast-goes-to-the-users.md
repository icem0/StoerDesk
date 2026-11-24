# WP-M24-07: the broadcast of the installation goes to the mail addresses of the users

format: small-model
status: planned
depends-on: WP-M24-06
phase: 24
milestone: m24
context-budget: 12k tokens
spec: specs/10-notifications.md §11.7, ADR-0046
spec-lines: 20

files-read:

- apps/api/src/escalation/actions.ts (the broadcast of a notify action)
- apps/api/src/notifications/channels/email.ts (the mail without a recipient)
- apps/api/src/users/ (the addresses of the users)

files-write:

- apps/api/src/notifications/channels/email.ts
- apps/api/src/escalation/actions.ts
- apps/api/src/notifications/__tests__/email.integration.spec.ts

interfaces:

- `sendEmailNotification(config, message, pwaUrl, recipients)` — the mail names its recipients
- `instanceMailRecipients(database)` — the mail addresses of the users of the instance

## Task

1. Give the e-mail adapter the recipients it never had: a broadcast names the
   mail addresses of the users of the instance, a personal message the address
   of the user.
2. Make the broadcast of a `notify` action without a target reach the users
   over their mail address.

## Non-goals

- No HTML body — WP-M24-09.
- No change of the other channels.
- No UI.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the test proves that the broadcast names the addresses of
the users.

## Handoff

- Files changed: the adapter of the e-mail, the actions of the escalation, the test
- Interfaces added: the recipients of the mail
- Verified: the commands above
- Follow-up WP: WP-M24-09 — the e-mail channel with the recipient and the HTML body
- Open question: none
