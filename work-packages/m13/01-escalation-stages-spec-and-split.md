# WP-M13-01: Escalation stages as the workflow milestones — specification, ADR and phase split

format: small-model
status: planned
depends-on: —
phase: 13
milestone: m13
context-budget: 24k tokens
spec: PLAN.md §9, §16, §17, §19; specs/07-escalation.md
spec-lines: 190

files-read:

- PLAN.md (§9 escalation, §16 roadmap, §17 limits, §19 open decisions)
- specs/07-escalation.md (§7.1–§7.5 of the former contract)
- specs/03-ticket-workflow.md, apps/api/src/tickets/workflow.ts (the transition map)
- packages/shared/src/escalation.ts, packages/shared/src/schemas/escalation-stages.ts
- apps/api/src/tickets/escalation.ts, apps/api/src/tickets/escalation-manual.ts
- docs/DECISIONS.md, docs/REPO-MAP.md

files-write:

- specs/07-escalation.md, specs/README.md
- docs/DECISIONS/0017-workflow-stages-as-escalation-stages.md, docs/DECISIONS.md
- PLAN.md
- work-packages/m13/ (WP-M13-01 … WP-M13-17, each file in this commit), work-packages/README.md, CHANGELOG.md

interfaces:

- `specs/07-escalation.md` §7.1–§7.11 — stages, waiting clocks, rules, conditions, actions, data model, API
- `docs/DECISIONS/0017-workflow-stages-as-escalation-stages.md` — the decision and its alternatives
- `PLAN.md` §6, §9, §16, §19 — the binding summary of phase 13

## Task

1. Rewrite `specs/07-escalation.md`: the stages are the five workflow milestones
   (`review`, `work_order`, `assignment`, `acceptance`, `acknowledgement`), a
   stage is a milestone to be reached, the deadline of a stage is the waiting
   time per priority, the rules carry a condition and the actions, the data model
   is relational and the manual catalogue is gone.
2. Add ADR-0017 (the decision, the rejected alternatives, the consequences) and
   its row in `docs/DECISIONS.md`.
3. Update `PLAN.md`: the escalation table of §9, the new tables of §6, the phase 13
   row of §16, the current state and the resolved open decision of §19.
4. Announce the split: this document and the files `work-packages/m13/02-…` …
   `17-…` exist in this commit; the backlog of `work-packages/README.md` gets the
   phase row and the seventeen rows.
5. Bookkeeping: one `docs` entry in `CHANGELOG.md`. No product code.

## Non-goals

- No schema, service, route, job, UI or test code.
- No change to the workflow state machine, to the timeline or to the notifications.
- No second definition of the stages outside the spec and the ADR.

## Acceptance

```bash
npm run wp:check
npm run check
git grep -n "WP-M13" -- work-packages/
```

Expected: `wp:check` green with the seventeen new documents valid; `check` green
because the package changes documentation only; the grep shows every `m13`
document and its backlog row.

## Handoff

- Files changed: the spec, the ADR, the plan, this document, the sixteen sibling
  documents, the backlog and the changelog
- Interfaces added: the contracts of `specs/07-escalation.md` §7.1–§7.11
- Verified: `npm run wp:check`, `npm run check`
- Follow-up WP: WP-M13-02 … WP-M13-17 (each file exists in this commit)
- Open question: none
