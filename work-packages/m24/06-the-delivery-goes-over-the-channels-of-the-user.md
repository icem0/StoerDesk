# WP-M24-06: the delivery goes over the channels of the user

**This package was split** into its children — the plan of this file was too
big for the limits of §17: **WP-M24-06a** (the own page loses the selection
per event type), **WP-M24-06b** (the channels send to the target of the user),
**WP-M24-06c** (the delivery goes over the channels of the user),
**WP-M24-06d** (the readiness selection leaves the web) and **WP-M24-06e** (the
routes of the selection leave the API). The file records the plan; the children
carry the implementation.

format: small-model
status: done (split into WP-M24-06a … WP-M24-06e)
depends-on: WP-M24-05
phase: 24
milestone: m24
context-budget: 20k tokens
spec: specs/10-notifications.md §11.4, §11.7, §11.10
spec-lines: 50

files-read:

- apps/api/src/notifications/outbox.ts (the queue and the drain)
- apps/api/src/notifications/receivers.ts (the recipients of an event)
- apps/api/src/notifications/preferences.ts (the selection that ends here)
- apps/api/src/notifications/channels/index.ts (the registry and the chain)

files-write:

- apps/api/src/notifications/receivers.ts
- apps/api/src/notifications/outbox.ts
- apps/api/src/notifications/preferences.ts
- apps/api/src/notifications/channels/index.ts

interfaces:

- `userChannels(database, userId)` — the confirmed channels of a user with their target
- `enqueueOutbox(...)` — writes one row per confirmed channel of the recipient
- `notification_preferences` — **removed** with the migration that drops it

## Task

1. Replace the reading of the selection by the reading of the channels of the
   user: the confirmed accounts (`verified_at` is set) and the web-push
   devices.
2. Write one outbox row per channel of the recipient with the target of the
   user in the row; a user without a confirmed channel gets the chain of the
   installation.
3. Remove the selection per event type: the module `preferences.ts`, the
   columns of the table `notification_preferences` and the migration that
   drops the table.

## Non-goals

- No UI.
- No change of the adapters — they take the target of the row (WP-M24-09).
- No change of the rule of the administration.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the test of the outbox proves that a message goes over the
channels of the recipient.

## Handoff

- Files changed: the recipients, the outbox, the preferences, the registry
- Interfaces added: `userChannels`
- Verified: the commands above
- Follow-up WP: WP-M24-07 — the broadcast of the installation goes to the mail addresses of the users
- Open question: none
