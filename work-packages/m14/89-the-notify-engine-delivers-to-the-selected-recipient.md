# WP-M14-89: the notify engine delivers to the selected recipient

format: small-model
status: done
depends-on: WP-M14-88
phase: 14
milestone: m14
context-budget: 18k tokens
spec: specs/07-escalation.md §7.5
spec-lines: 30

files-read:

- apps/api/src/escalation/actions.ts
- apps/api/src/escalation/distribution.ts
- apps/api/src/notifications/outbox.ts
- apps/api/src/notifications/channels/ntfy.ts

files-write:

- apps/api/src/escalation/actions.ts
- apps/api/src/notifications/outbox.ts
- apps/api/src/notifications/channels/ntfy.ts

interfaces:

- a targeted `notify` action resolves one user or the technicians of a readiness
  pool and queues one ntfy row per own topic
- `messageOf()` carries `ntfyPriority` to the adapter
- `sendNtfyNotification()` prefers the explicit `ntfyPriority` over the ticket default

## Task

1. In `dispatchEscalationActions` resolve a notify target: a `user` is one id, a
   `pool` is the member list of `resolvePoolMemberIds`; read the own ntfy topics
   with `ntfyTopicsOfUsers('ticket.escalated', ids)` and queue one
   `ticket.escalated` row per topic.
2. Without a target the action keeps the channel broadcast; both paths carry the
   selected priority as `ntfyPriority` in the row target.
3. `messageOf` reads `ntfyPriority` and hands it to the ntfy adapter, which uses
   the explicit level over its ticket-based default.
4. Prove the user target and the priority in the actions integration test and the
   explicit level in the ntfy unit test.

## Non-goals

- No UI (WP-M14-90).
- No per-user routing for channels other than ntfy.
- No new database column or migration.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the actions integration test (4/4) and the ntfy unit test
(10/10) pass.

## Handoff

- Files changed: the action dispatcher, the outbox message builder, the ntfy
  adapter, both tests and the repository bookkeeping
- Interfaces added: targeted notify rows, `MessagePriority.ntfyPriority`,
  `NotificationMessage.ntfyPriority`
- Verified: typecheck (api, shared), actions integration 4/4, ntfy unit 10/10
- Follow-up WP: WP-M14-90 (the administration selects recipient and priority)
- Open question: none
