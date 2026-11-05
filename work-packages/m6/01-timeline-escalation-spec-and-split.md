# WP-M6-01: timeline and escalation specification and phase-6 split

format: small-model
status: done
depends-on: —
phase: 6
milestone: m6
context-budget: 16k tokens
spec: PLAN.md §9, §16 phase 6, §19; specs/05-timeline.md; specs/07-escalation.md
spec-lines: 120

files-read:

- PLAN.md (§9 Timeline and escalation, §16 phase 6, §19 open decisions)
- specs/02-data-model.md (§4.8, §4.12 tables of later phases)
- specs/README.md (slice boundaries)

files-write:

- specs/05-timeline.md
- specs/07-escalation.md
- docs/DECISIONS/0008-deadline-and-escalation-defaults.md
- docs/DECISIONS.md (index row)

interfaces:

- `specs/05-timeline.md` — interval, `ticket_pauses`, calculation, colours, API shape
- `specs/07-escalation.md` — rule table, `escalated` event, idempotency, pg-boss job
- ADR-0008 — deadline hours per priority and the settings override

## Task

1. Replace the two placeholder slices with the reviewed content from `PLAN.md`
   §9; keep the chapter boundaries of `specs/README.md`.
2. Resolve the open decision "default deadlines per priority" with ADR-0008:
   low 168 h, normal 72 h, high 24 h, critical 8 h, settings override.
3. Name the phase-6 work packages WP-M6-02 … WP-M6-13 in `work-packages/m6/`,
   one commit each after this specification commit.
4. Do not write product code in this package.

## Non-goals

- No schema, service, route, job or UI code.
- No notification delivery (phase 7).
- No contract-type deadlines (`contracts_refs` is not implemented yet).

## Acceptance

```bash
npm run wp:check
```

Expected: green; every new WP file is a valid small-model package.

## Handoff

- Files changed: the two spec slices, ADR-0008 and the decision index
- Interfaces added: the reviewed phase-6 contracts above
- Verified: `npm run wp:check` green; the split names WP-M6-02 … WP-M6-13
- Follow-up WP: WP-M6-02 … WP-M6-13 (each file exists in this commit)
- Open question: contract-type deadlines stay deferred to the `contracts_refs` phase
