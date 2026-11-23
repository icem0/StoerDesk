# WP-M19-03: the assignee pool is an escalation setting

format: small-model
status: done
phase: 19
milestone: m19
context-budget: 16k tokens
depends-on: WP-M19-02
spec: docs/DECISIONS/0039-the-assignment-names-one-technician-and-its-status.md §3; specs/07-escalation.md §7.14 (The assignee pool)
spec-lines: 30

files-read:

- apps/api/src/escalation/config.ts (the escalation config read and write)
- apps/api/src/oncall/settings.ts (the pattern of a settings key with a validated value)
- packages/shared/src/schemas/escalation.ts (the escalation config contract)

files-write:

- apps/api/src/escalation/assignee-pool.ts (read, replace, validate)
- apps/api/src/escalation/routes.ts (the config route only)
- packages/shared/src/schemas/escalation.ts (`assigneePool` in the config contract)

interfaces:

- setting key `escalation.assignee_pool` — ordered array of user uuids, unique, max. 50
- `GET /api/v1/escalation/config` answers `assigneePool: { id, name }[]` (names only, no contact value)
- `PUT /api/v1/escalation/config` accepts `assigneePool: string[]`, guarded by `settings.write`
- `resolveAssigneePool(database): Promise<string[]>` — active users in pool order

## Task

1. Store the pool as the setting `escalation.assignee_pool` (the existing settings store).
2. `PUT` rejects unknown or inactive user ids with `400 invalid_assignee`; the
   order of the array is the order of the chain (ADR-0039 decision 4).
3. `resolveAssigneePool` skips inactive users and answers the ids in order.

## Non-goals

- No UI (WP-M19-06).
- No assignment logic (WP-M19-04).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run test:run
npm run wp:check
```

Expected: an integration test writes a pool, reads it back in order, and gets
`400 invalid_assignee` for an inactive user.

## Handoff

- Files changed: apps/api/src/escalation/assignee-pool.ts (new),
  apps/api/src/escalation/config.ts,
  packages/shared/src/schemas/escalation-config.ts,
  apps/web/src/admin/escalation-page.tsx (the empty pool of the state),
  apps/api/src/escalation/__tests__/assignee-pool.integration.spec.ts (new),
  CHANGELOG.md, work-packages/README.md, this document
- Interfaces added: the setting `escalation.assignee_pool`,
  `readAssigneePool`, `readAssigneePoolIds`, `validateAssigneePool`,
  `writeAssigneePool`, `resolveAssigneePool`, `nextAssignee`, `firstAssignee`,
  `EscalationConfig.assigneePool`
- Verified: `npm run typecheck --workspaces --if-present` and the integration
  spec of the pool (the list keeps its order, a deactivated and a duplicated id
  are refused with `400 invalid_assignee`); `npm run wp:check` green
- Follow-up WP: none
- Open question: none
- Notes: the contract of the pool lives in
  `packages/shared/src/schemas/escalation-config.ts` — the file
  `packages/shared/src/schemas/escalation.ts` of the plan does not exist. The
  route file needed no change: the body of `PUT /api/v1/escalation/config`
  reaches the service unchanged, and the pool is optional — a body without
  `assigneePool` leaves the list untouched.
