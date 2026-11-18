# WP-M14-147b: the engine reads the readiness

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 20k tokens
spec: specs/07-escalation.md §7.4, §7.5, §7.8; specs/04-oncall.md §4a.6
spec-lines: 70

depends-on: WP-M14-147a

files-read:

- apps/api/src/oncall/coupling.ts (`resolveOnCallPerson`, the states of a shift)
- apps/api/src/tickets/escalation.ts (the scan, the facts of a ticket)
- apps/api/src/escalation/actions.ts (the `notify` action)
- apps/api/src/db/schema.ts (`oncallShifts`, `oncallPools`)

files-write:

- apps/api/src/oncall/coupling.ts
- apps/api/src/tickets/escalation.ts
- apps/api/src/escalation/actions.ts

interfaces:

- `resolveStaffedPoolIds(database, at): Promise<string[]>` — the pools with a
  staffed shift at `at`
- `resolveOnDutyUserIds(database, poolId, at): Promise<string[]>` — the
  technicians with a shift in that pool at `at`
- `evaluateEscalations(database, now)` — the scan reads the staffed pools once
  and puts them into the facts of every ticket
- `dispatchEscalationActions(database, firing, facts, at)` — the target of a
  `notify` action reaches the technicians on duty

## Task

1. `apps/api/src/oncall/coupling.ts`: the constant of the states that count as
   a shift becomes exported (`CONFIRMED`, `SWAP_REQUESTED`, `PLANNED` — the rule
   of `specs/04-oncall.md` §4a.6). Two new functions read the shifts of the
   table `oncall_shifts` that cover the moment `at` and have a technician:
   `resolveStaffedPoolIds` returns their pools, `resolveOnDutyUserIds` the
   technicians of one pool.
2. `apps/api/src/tickets/escalation.ts`: the facts of a ticket gain the
   `staffedPools`. The scan reads them once — before the loop over the tickets,
   not per ticket — and hands them to every ticket. `evaluateTicketEscalations`
   reads them for its own ticket.
3. `apps/api/src/escalation/actions.ts`: the `notify` action with a readiness
   pool as its target resolves its addressees over
   `resolveOnDutyUserIds` instead of over the members of the pool. A pool
   without a staffed shift has no addressee and the action writes nothing. The
   moment of the evaluation travels into the dispatcher as the parameter `at`.

## Non-goals

- No change of the `offer` and the `assign` action: they distribute the ticket
  to the whole team of the target (§7.14).
- No new event type and no new channel: the notification stays
  `ticket.escalated` over ntfy.
- No change of the schedule: the scan still runs every minute (§7.8).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the integration test proves that a rule with the
condition `shift` fires with a staffed pool and stays silent without one, and
that the notification reaches the technician on duty and not the member of the
pool without a shift.

## Handoff

- Files changed: `apps/api/src/oncall/coupling.ts`,
  `apps/api/src/tickets/escalation.ts`, `apps/api/src/escalation/actions.ts`,
  `apps/api/src/escalation/__tests__/readiness-shift.integration.spec.ts`,
  `docs/REPO-MAP.md`, this document, `work-packages/README.md`, `CHANGELOG.md`,
  `PLAN.md` §16
- Interfaces added: `resolveStaffedPoolIds`, `resolveOnDutyUserIds`,
  `ONCALL_STAFFED_STATES`, the fact `staffedPools` in the scan
- Verified: `npm run check`
- Follow-up WP: WP-M14-147c
- Open question: none
