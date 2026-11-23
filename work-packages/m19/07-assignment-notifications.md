# WP-M19-07: the notices of the assignment

format: small-model
status: done
phase: 19
milestone: m19
context-budget: 16k tokens
depends-on: WP-M19-04
spec: specs/10-notifications.md §11.4; specs/07-escalation.md §7.14 (The notifications)
spec-lines: 40

files-read:

- specs/10-notifications.md (§11.4 event types, §11.5 targets)
- apps/api/src/escalation/actions.ts (the `notify` targets)
- apps/api/src/notifications/ (the outbox writer)

files-write:

- packages/shared/src/schemas/notifications.ts (new event type `ticket.assignment_answered`)
- apps/api/src/escalation/actions.ts (the targets `assigned` and `assigner`)
- apps/api/src/tickets/assignment.ts (queues the notices on accept and decline)

interfaces:

- event type `ticket.assignment_answered` — payload `{ ticketNo, answer, assigneeName }`
- `notify` target `assigner` — resolves `tickets.assigned_by_user_id`; NULL reaches nobody
- `notify` target `assigned` — resolves `tickets.assigned_user_id`

## Task

1. Add the event type and its channel defaults in the notification contract.
2. `answerAssignment` writes one outbox row per channel the assigner selected for
   `ticket.assignment_answered` (ADR-0037 rule: the recipient chooses the way).
3. `assignTicket` notifies the assigned technician with `ticket.assigned`.

## Non-goals

- No change of the channel adapters.
- No new settings page; the channel selection of the user is the existing one.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run test:run
npm run wp:check
```

Expected: tests that an accept writes one outbox row for the assigner and none for
an assigner that is NULL.

## Handoff

- Files changed: packages/shared/src/schemas/notification.ts,
  packages/shared/src/schemas/escalation-config.ts,
  apps/api/src/notifications/assignment.ts (new),
  apps/api/src/tickets/assignment.ts,
  apps/api/src/escalation/actions.ts,
  apps/api/src/escalation/distribution.ts,
  apps/api/src/db/migrations/0057_notification_event_assignment_answered.sql,
  apps/web/src/admin/escalation-action-editor.tsx (the target `assigner`),
  apps/web/src/i18n/locales/{de,en}/common.json,
  apps/web/src/i18n/locales/{de,en}/settings.json,
  apps/api/src/tickets/__tests__/assignment.integration.spec.ts,
  apps/api/src/escalation/__tests__/actions.integration.spec.ts,
  apps/web/src/admin/__tests__/escalation-actions-editor.test.tsx,
  CHANGELOG.md, work-packages/README.md, this document
- Interfaces added: the event type `ticket.assignment_answered`, the notify
  target `assigner`, `notifyAssignee`, `notifyAssigner`
- Verified: `npm run typecheck --workspaces --if-present` and the integration
  spec of the assignment (an acceptance writes one outbox row for the assigner,
  a rule-made assignment writes none), `npm run i18n:check` and
  `npm run wp:check` green
- Follow-up WP: none
- Open question: none
- Notes: the contract of the event types lives in
  `packages/shared/src/schemas/notification.ts` — the file
  `packages/shared/src/schemas/notifications.ts` of the plan does not exist. The
  notice of the assignment moved into the service of the assignment, so the
  manual assignment and the assignment of the escalation notify the technician
  in the same way. The target `assigned` of a `notify` action reads the
  technician of the ticket (`tickets.assigned_user_id`) instead of the retired
  table.
