# WP-M24-07: the broadcast of the installation goes to the mail addresses of the users

format: small-model
status: done
depends-on: WP-M24-06c
phase: 24
milestone: m24
context-budget: 12k tokens
spec: specs/10-notifications.md §11.7, ADR-0046
spec-lines: 20

files-read:

- apps/api/src/notifications/channels/index.ts (the registry and the chain)
- apps/api/src/notifications/channels/email.ts (the mail with its recipients)
- apps/api/src/db/schema.ts (the users of the instance)

files-write:

- apps/api/src/notifications/channels/index.ts
- work-packages/m24/07-the-broadcast-goes-to-the-users.md

interfaces:

- `instanceMailRecipients(env)` — the mail addresses of the active users of the instance

## Task

1. Give the broadcast of the e-mail its recipients: the mail addresses of the
   active users of the instance — the office is the list (ADR-0046). A personal
   message goes to the address of the user alone.
2. The addresses are read over the short-lived pool of the channel, the same
   shape the web push and the WhatsApp bridge use.

## Non-goals

- No HTML body — WP-M24-10.
- No change of the other channels.
- No UI.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green.

## Handoff

- Files changed: the registry of the channels
- Interfaces added: the recipients of the broadcast
- Verified: the commands above
- Follow-up WP: WP-M24-09 — the mail address of the user and the room of the user
- Open question: none
