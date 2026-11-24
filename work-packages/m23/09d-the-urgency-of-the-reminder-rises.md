# WP-M23-09d: the urgency of the reminder rises

format: small-model
status: done
depends-on: WP-M23-09b
phase: 23
milestone: m23
context-budget: 20k tokens
spec: specs/10-notifications.md §11.5, §11.7
spec-lines: 40

files-read:

- apps/api/src/notifications/outbox.ts (the message of a readiness row)
- apps/api/src/notifications/channels/index.ts (the options of a send)
- apps/api/src/notifications/channels/web-push.ts (the push of a browser)
- apps/api/src/notifications/channels/ntfy.ts (the priority of ntfy)

files-write:

- apps/api/src/notifications/outbox.ts
- apps/api/src/notifications/channels/index.ts, apps/api/src/notifications/channels/web-push.ts
- apps/api/src/notifications/channels/__tests__/web-push.test.ts
- specs/10-notifications.md, specs/04-oncall.md

interfaces:

- `MessageOptions.urgency` — the urgency of one message: `normal` or `high`
- `readinessMessageOf(target)` — the message of a readiness row carries the
  number of the reminder; a further reminder of a shift that was not accepted
  arrives with the higher urgency

## Task

1. The message of a readiness row carries no priority today
   (`readinessMessageOf` in `apps/api/src/notifications/outbox.ts`), so the
   reminder of a shift that was not accepted arrives like any other message.
   The row of the sweep carries the number of the reminder (WP-M23-09b): the
   second reminder and every further one carry the higher urgency.
2. The urgency reaches the channels: `MessageOptions` gains the field
   `urgency`, the push of the browser sends it as `urgency: 'high'` to the push
   service (the library of the project supports the values `low`, `normal` and
   `high`), and ntfy keeps its own priority of the ticket — the readiness
   message has no ticket priority, so the level of the reminder is the number
   of the reminder, capped at the highest level of ntfy.
3. The fallback chain of §11.7 stays as it is: every channel of the chain
   receives the same message.
4. Name the urgency in `specs/10-notifications.md` §11.5 and §11.7.

## Non-goals

- No change of the channels, of their configuration and of the fallback chain.
- No change of the messages of a ticket.
- No new channel and no new notification event type.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new tests fail before the change and pass after it.

## Handoff

- Files changed: the message of the outbox, the options of a send, the push of
  the browser, the test of the push, the two specs
- Interfaces added: `MessageOptions.urgency`
- Verified: the commands above
- Follow-up WP: WP-M23-09e, WP-M23-09f
- Open question: none
