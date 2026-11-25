# WP-M32-01: the assignment names a target of the installation

format: ctx-256k
status: planned
phase: 32
milestone: m32
context-budget: 40k tokens
depends-on: —
spec: specs/07-escalation.md §7.14; docs/DECISIONS/0057-the-assignment-names-a-target-of-the-installation.md
spec-lines: 120
changed-lines: 150

files-read:

- specs/07-escalation.md (§7.5 the actions, §7.14 the offer and the assign action)
- specs/04-oncall.md (§4a.5 the members of a pool and of a group)
- docs/DECISIONS/0011-oncall-slot-model-and-swap-approval.md (decision 3: the membership of a pool follows the group)
- docs/DECISIONS/0039-the-assignment-names-one-technician-and-its-status.md (decision 3: the pool of the office)

files-write:

- specs/07-escalation.md (§7.14 the target of the assignment, the retired assignee pool)
- docs/DECISIONS/0057-the-assignment-names-a-target-of-the-installation.md (the decision)
- docs/DECISIONS/0039-the-assignment-names-one-technician-and-its-status.md (the status of decision 3)
- docs/DECISIONS.md (the index of the decisions)
- PLAN.md (§16 the phase 32, the current state)
- work-packages/README.md (the phase and its work packages)
- work-packages/m32/01-the-assignment-names-a-target.md (this document)
- work-packages/m32/02-the-assignment-carries-its-target.md
- work-packages/m32/03-the-interface-assigns-a-target.md
- work-packages/m32/04-the-pool-of-the-office-is-gone.md

interfaces:

- `EscalationTarget` — `{ kind: 'pool' | 'group' | 'user', id: string }`, the target of the `offer` and the `assign` action
- `tickets.assignment_target_kind` and `tickets.assignment_target_id` — the target of the assignment of a ticket
- the members of the target are the chain of the refusal, ordered by name

## Task

1. Write ADR-0057: the assignment names a target of the installation — a
   readiness pool, a user group or one technician; the members of the target
   are the chain of the refusal; the setting `escalation.assignee_pool` and
   the tab _Pool der Office_ are gone. ADR-0039 keeps its other decisions;
   its decision 3 is superseded.
2. Rewrite `specs/07-escalation.md` §7.14: the target of the assignment, the
   action `assign` with its target, the two new columns of the ticket and the
   retired model of the assignee pool.
3. Name the phase 32 in `PLAN.md` §16 with its exit criteria and its current
   state.
4. Create the work packages of the phase: the backend (WP-M32-02), the
   interface (WP-M32-03) and the purge of the rest (WP-M32-04).

## Non-goals

- No code in this package — the code follows in WP-M32-02 … WP-M32-04.
- No change of the offer action and of its timeout chain.
- No new order for the members of a pool or of a group.

## Acceptance

```bash
npm run wp:check
npm run lint
```

Expected: `npm run wp:check` is green — the four work packages of the phase are
known to the checker; the documents name the decision, the phase and the
work packages.

## Handoff

- Files changed: specs/07-escalation.md,
  docs/DECISIONS/0057-the-assignment-names-a-target-of-the-installation.md,
  docs/DECISIONS/0039-the-assignment-names-one-technician-and-its-status.md,
  docs/DECISIONS.md, PLAN.md, work-packages/README.md, the four work packages
  of `work-packages/m32/`
- Interfaces added: `EscalationTarget` as the target of the assignment,
  `tickets.assignment_target_kind`, `tickets.assignment_target_id`
- Verified: `npm run wp:check`
- Follow-up WP: WP-M32-02 (the backend), WP-M32-03 (the interface),
  WP-M32-04 (the purge of the rest)
- Open question: none
- Notes: the members of a pool and of a group are ordered by name
  (`resolvePoolMemberIds`, `resolveGroupMemberIds`) — the installation stores
  no further order for the chain of the refusal.
