# WP-M14-82: the engine offers and assigns a ticket

format: small-model
status: done
depends-on: WP-M14-81
phase: 14
milestone: m14
context-budget: 22k tokens
spec: specs/07-escalation.md §7.14
spec-lines: 60

files-read:

- apps/api/src/oncall/routes.ts (the pool members rule of §4a.5)
- apps/api/src/escalation/actions.ts (the dispatcher of the actions)
- apps/api/src/tickets/workflow.ts (`transitionTicket`, `TicketTransitionError`)
- apps/api/src/db/schema.ts (`ticketAssignees`, `oncallPools`, `groups`, `userGroups`, `userRoles`)
- packages/shared/src/schemas/escalation-config.ts (`escalationTargetSchema`)

files-write:

- apps/api/src/oncall/members.ts
- apps/api/src/oncall/routes.ts (the members route uses the shared resolution)
- apps/api/src/escalation/distribution.ts
- apps/api/src/escalation/actions.ts

interfaces:

- `resolveGroupMemberIds(database, groupId): Promise<string[]>`
- `resolvePoolMemberIds(database, poolId): Promise<string[]>`
- `resolveTargetTechnicians(database, target): Promise<string[]>`
- `distributeTicket(database, { ticketId, target, kind, ruleKey, stageKey, payload? }): Promise<DistributionResult>`
- `EscalationActionResult` gains `offered` and `assigned`

## Task

1. `apps/api/src/oncall/members.ts` (new): the technicians of a target — the
   members of the group of the target (`user_groups`, active users only) and,
   for a pool without a group, every active user holding the `oncall` role.
   The pool members rule of `GET /api/v1/oncall/pools/:id/members` (§4a.5) is
   extracted here so the on-call route and the escalation share one resolution.
2. `apps/api/src/oncall/routes.ts`: the members route calls
   `resolvePoolMemberIds` — the inline query is replaced by the shared
   resolution.
3. `apps/api/src/escalation/distribution.ts` (new): `distributeTicket` performs
   the `offered` or `assigned` step of the transition table through
   `transitionTicket()` (actor `system`), writes one row of `ticket_assignees`
   per technician of the target for an assignment, and appends one
   `escalation_note` event `{ rule, stage, target }`. A ticket whose status has
   no such step or a target without a technician changes nothing —
   `TicketTransitionError` is caught and reported as `changed: false`.
4. `apps/api/src/escalation/actions.ts`: the dispatcher runs the two new action
   types with the target from the action `config`; `EscalationActionResult`
   counts `offered` and `assigned`.
5. The integration spec `apps/api/src/escalation/__tests__/distribution.integration.spec.ts`
   proves the assignment (status, assignees, note), the offer to a pool, the
   ticket without a step and the target without a technician.

## Non-goals

- The `offered_to_user_id`, the offer timeout and the notification of the
  technicians move to the split child WP-M14-82b (the package was over the
  four-file limit of `PLAN.md` §17).
- No configuration service, no UI (WP-M14-83 … WP-M14-85).
- No change of the manual offer route of the office.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new integration spec fails before the change and
passes after it.

## Handoff

- Files changed: `apps/api/src/oncall/members.ts`, `apps/api/src/oncall/routes.ts`,
  `apps/api/src/escalation/distribution.ts`, `apps/api/src/escalation/actions.ts`,
  the integration spec and the repository bookkeeping
- Interfaces added: `resolveGroupMemberIds`, `resolvePoolMemberIds`,
  `resolveTargetTechnicians`, `distributeTicket`, `DistributionResult`,
  `offered` and `assigned` in the scan result
- Verified: typecheck, ESLint, vitest (the distribution spec 4/4 on a
  throwaway database; the on-call coupling specs stay green on the shared
  resolution), `i18n:check`, `wp:check`
- Follow-up WP: WP-M14-82b (the offer names the responsible person and the
  distribution notifies the technicians) — its file exists in this commit;
  WP-M14-83 … WP-M14-85 stay open in numeric order
- Open question: none
