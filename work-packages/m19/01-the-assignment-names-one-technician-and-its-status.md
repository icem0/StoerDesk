# WP-M19-01: the assignment names one technician and its status (spec and ADR)

format: small-model
status: done
phase: 19
milestone: m19
context-budget: 12k tokens
depends-on: WP-M14-80, WP-M14-85, WP-M14-150, WP-M17-00
spec: docs/DECISIONS/0039-the-assignment-names-one-technician-and-its-status.md; specs/07-escalation.md §7.14
spec-lines: 80

files-read:

- specs/07-escalation.md (§7.5 action table, §7.14)
- docs/DECISIONS/0026-the-escalation-offers-and-assigns-tickets.md
- docs/DECISIONS/0033-the-assignment-names-a-technician.md
- apps/api/src/db/schema.ts (tickets, ticket_assignees, ticket_events)

files-write:

- docs/DECISIONS/0039-the-assignment-names-one-technician-and-its-status.md and docs/DECISIONS.md (index row)
- specs/07-escalation.md (§7.5 `assign` row, §7.14)
- work-packages/m19/ (eight files) and work-packages/README.md (phase row, backlog rows)

interfaces:

- none (documents only)

## Task

**The assignment of the office (phase 19).** The office could not choose an
employee for the workflow action _Zuweisen_ and the escalation action _assign_ had
no selectable pool. The office asked for one technician per ticket, a status of the
assignment (`offered`, `accepted`, `declined`), the next pool member after a refusal
and a notice to the user who made the assignment.

1. ADR-0039 records the decision: one assignee in `tickets.assigned_user_id`, the
   columns `assignment_status` and `assigned_by_user_id`, the mode of the action
   `assign` (`pool` or `user`), the assignee pool as a setting, the refusal chain
   and the two notifications.
2. `specs/07-escalation.md` §7.5 (the `assign` row) and §7.14 are rewritten; §7.14
   keeps `offer` unchanged.
3. The child work packages WP-M19-02 … WP-M19-08 are created in this commit and
   listed in the backlog of `work-packages/README.md`.

## Non-goals

- No code, no migration, no route change in this WP.
- No change of `offer` (ADR-0026 timeout chain).

## Acceptance

```bash
npm run wp:check
npm run check
```

Expected: the spec and ADR documents pass the checks; `npm run check` stays green.

## Handoff

- Files changed: ADR-0039, `docs/DECISIONS.md`, `specs/07-escalation.md`, the
  work packages `work-packages/m19/` and `work-packages/README.md`
- Interfaces added: none
- Verified: see the run report of this session
- Follow-up WP: WP-M19-02, WP-M19-03, WP-M19-04, WP-M19-05, WP-M19-06,
  WP-M19-07, WP-M19-08
- Open question: the manual picker of the ticket view offers the assignee pool; an
  empty pool offers every active user. Confirm with the office before WP-M19-06.
