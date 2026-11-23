# WP-M19-05: the routes of the assignment and the escalation action mode

format: small-model
status: done
phase: 19
milestone: m19
context-budget: 18k tokens
depends-on: WP-M19-04
spec: docs/DECISIONS/0039-the-assignment-names-one-technician-and-its-status.md §3, §4; specs/07-escalation.md §7.5, §7.14
spec-lines: 50

files-read:

- apps/api/src/tickets/assignment.ts (WP-M19-04)
- apps/api/src/escalation/actions.ts (the `assign` action config)
- packages/shared/src/schemas/escalation.ts (the action schema)

files-write:

- apps/api/src/tickets/routes.ts (or the existing ticket route file that holds the workflow actions)
- packages/shared/src/schemas/ticket.ts (`assignBody`, `answerAssignmentBody`)
- apps/api/src/escalation/actions.ts (`mode`, `user`, `acceptance` in the `assign` action)

interfaces:

- `POST /api/v1/tickets/:ticketNo/assign` — body `{ userId, acceptance }`, guarded by `ticket.assign`, answers the new ticket state
- `POST /api/v1/tickets/:ticketNo/assignment-answer` — body `{ answer: 'accepted' | 'declined' }`, guarded by `ticket.read` and the assignee check
- the `assign` action config: `{ mode: 'pool' | 'user', user?: uuid, acceptance: boolean }`

## Task

1. The two routes validate the body with Zod and call the service of WP-M19-04.
2. The `assign` action of a rule reads `mode`: `pool` starts at the first active
   member of the assignee pool, `user` names the technician.
3. The old `ticket_assignees` write of the `assign` action is removed.

## Non-goals

- No UI and no notification (WP-M19-06, WP-M19-07).
- No migration of old rows (WP-M19-08).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run test:run
npm run wp:check
```

Expected: route tests for 200, 400 (unknown user), 403 (foreign answer) and the
action test for `mode = pool`.

## Handoff

- Files changed: apps/api/src/tickets/workflow-routes.ts,
  packages/shared/src/schemas/ticket.ts, packages/shared/src/schemas/escalation-config.ts,
  apps/api/src/escalation/actions.ts, apps/api/src/escalation/config.ts,
  apps/api/src/escalation/distribution.ts,
  apps/api/src/db/migrations/0056_escalation_action_assign_mode.sql,
  apps/web/src/admin/escalation-action-editor.tsx (the mode of the `assign` action),
  apps/web/src/i18n/locales/{de,en}/settings.json,
  apps/api/src/tickets/__tests__/assignment-routes.integration.spec.ts (new),
  apps/api/src/escalation/__tests__/distribution.integration.spec.ts,
  apps/api/src/escalation/__tests__/config-routes.integration.spec.ts,
  apps/api/src/escalation/__tests__/assign-target.integration.spec.ts,
  apps/web/src/admin/__tests__/escalation-actions-editor.test.tsx,
  CHANGELOG.md, work-packages/README.md, this document
- Interfaces added: `POST /api/v1/tickets/:ticketNo/assign` (body
  `{ userId, acceptance }`), `POST /api/v1/tickets/:ticketNo/assignment-answer`
  (body `{ answer }`), `assignBodySchema`, `answerAssignmentBodySchema`,
  the action config `{ mode, user?, acceptance }`
- Verified: `npm run typecheck --workspaces --if-present`, the integration specs
  of the routes (200, 400 for an unknown technician, 403 for the answer of a
  foreign technician), the modes `pool` and `user` of the action,
  `npm run i18n:check` and `npm run wp:check` green
- Follow-up WP: none
- Open question: none
- Notes: the permission of the assignment stays `ticket.assign`, the answer of
  the assignment is guarded by `ticket.read` — the assignee check of the
  service is the second guard. The editor of the actions had to follow in this
  work package: the contract of the `assign` action changed, and the
  administration would otherwise send a body the server refuses. The migration
  `0056` rewrites the stored configurations of the former shape — a user target
  becomes the mode `user`, every other target the mode `pool`.
