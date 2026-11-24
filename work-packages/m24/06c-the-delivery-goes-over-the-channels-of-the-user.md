# WP-M24-06c: the delivery goes over the channels of the user

format: small-model
status: done
depends-on: WP-M24-06b
phase: 24
milestone: m24
context-budget: 20k tokens
spec: specs/10-notifications.md §11.4, §11.7, §11.10, ADR-0045
spec-lines: 50

files-read:

- apps/api/src/notifications/outbox.ts (the queue and the drain)
- apps/api/src/notifications/receivers.ts (the recipients of an event)
- apps/api/src/notifications/assignment.ts (the notices of an assignment)
- apps/api/src/escalation/actions.ts (the notify action of an escalation)
- apps/api/src/escalation/distribution.ts (the distribution of a ticket)

files-write:

- apps/api/src/notifications/receivers.ts
- apps/api/src/notifications/outbox.ts
- apps/api/src/notifications/accounts.ts
- apps/api/src/notifications/assignment.ts

interfaces:

- `userChannels(database, userId)` — the confirmed channels of a user with their target
- `personalRecipients(database, userIds, env?)` — the channels of the recipients; without a confirmed channel the chain of the installation
- `readAccountSecret(database, userId, channel)` — the write-only secret of the account of the user
- `enqueueOutbox(...)` — writes the rows of the channels of the installation
- `enqueueOncallOutbox(...)` — writes the rows of the channels of the technician

## Task

1. Write the resolver: the channels of a user are his **confirmed** accounts
   and his web-push devices; an account that was never confirmed is no channel
   of the user.
2. Write the personal deliveries over these channels: the assignment, the
   answer of the assignment, the escalation that names him and the readiness of
   his shift carry the target of the user in the row of the outbox.
3. The fallback of the delivery: a user without a confirmed channel is
   notified over the chain of the installation — a message never stays in the
   queue because a user has no channel of his own.
4. The drain resolves the write-only secret of the account of the user (the
   Matrix token) at the moment of the send — the secret never enters a row.
5. Remove the selection per event type and the mandatory channels of the
   critical tickets; the rule of the administration decides what a user must
   have set up, never the way of a message.

## Non-goals

- No UI.
- No change of the adapters — they take the target of the row (WP-M24-06b).
- No confirmation of the account — WP-M24-08.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the test of the outbox proves that the message goes over
the channels of the recipient and that a user without a confirmed channel gets
the chain of the installation.

## Handoff

- Files changed: the recipients, the outbox, the accounts, the assignment, the
  actions of the escalation, the distribution, the tests of the chapter
- Interfaces added: the resolver, the secret of the account
- Verified: the commands above
- Follow-up WP: WP-M24-08 — the code over the channel confirms the account
- Open question: none
