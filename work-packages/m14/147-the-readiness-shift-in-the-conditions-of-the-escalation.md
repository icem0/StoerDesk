# WP-M14-147: the readiness shift in the conditions of the escalation — the spec and the split

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 20k tokens
spec: specs/07-escalation.md §7.4, §7.5; specs/04-oncall.md §4a.2, §4a.6; PLAN.md §9
spec-lines: 90

depends-on: WP-M14-146

files-read:

- specs/07-escalation.md (§7.4 the conditions, §7.5 the actions)
- specs/04-oncall.md (§4a.2 the pools, §4a.6 the coupling)
- packages/shared/src/schemas/escalation-config.ts (the fields and the facts)
- apps/api/src/tickets/escalation.ts (the facts of the scan)
- apps/api/src/escalation/actions.ts (the `notify` action)
- apps/web/src/admin/escalation-condition-builder.tsx (the builder of a condition)

files-write:

- specs/07-escalation.md (§7.4 the field `shift`, §7.5 the addressees of a target)
- docs/DECISIONS/0030-the-readiness-shift-is-a-condition-of-the-escalation.md, docs/DECISIONS.md
- PLAN.md (§9 the readiness in the conditions, §16 the record)
- work-packages/m14/147-…, 147a-…, 147b-…, 147c-…, 147d-…

interfaces:

- the condition field `shift` — the value is the uuid of a readiness pool; it
  matches when the pool has a staffed shift at the moment of the evaluation
- the fact `staffedPools` — the pools that are staffed at that moment
- the target of a `notify` action — a readiness pool reaches the technicians
  who have a shift in that pool, not every member of it (ADR-0030)

## Task

**The comment of the office (out of band in phase 14).** „zu den bedingungen
bei den escalationsstufen muss die Schicht wählbar sein also Bereitschafts-Schicht
und dann den schicht-pool auswählen … es geht darum dass die techniker der
schicht nur dann eine nachricht bekommen sollen, wenn sie auch schicht haben".

The escalation knows the ticket; the readiness calendar knows the shifts. The
office wants the two to meet: the conditions of a stage shall offer the
**Bereitschafts-Schicht** with the pool of the shift, and the message shall
reach the technicians who have a shift — not the whole standby team.

The decision splits into four packages:

1. **WP-M14-147a** — the shared contract: the field `shift`, the fact
   `staffedPools` and the evaluation.
2. **WP-M14-147b** — the engine: the scan reads the staffed pools, the
   condition matches, and the `notify` action reaches the technicians on duty.
3. **WP-M14-147c** — the configuration service: a pool of the condition that
   does not exist answers `400 invalid_target`.
4. **WP-M14-147d** — the administration: the builder of a condition offers the
   pool of the shift.

This package writes no product code.

## Non-goals

- No migration: the field lives in the jsonb of the condition.
- No change of the `offer` and the `assign` action: they distribute the ticket
  to the team of the target (§7.14).
- No change of the on-call coupling: `resolveOnCallPerson` keeps its meaning
  (`specs/04-oncall.md` §4a.6).

## Acceptance

```bash
npm run i18n:check
npm run wp:check
```

Expected: all green; the spec names the field and the addressees, the ADR
carries the decision with its alternatives, and the four child documents exist.

## Handoff

- Files changed: the escalation spec, the ADR and its index, `PLAN.md` §9/§16,
  this document and the four child documents
- Interfaces added: the field `shift`, the fact `staffedPools`, the addressees
  of a readiness pool as the target of a `notify` action
- Verified: `npm run wp:check`, `npm run i18n:check`
- Follow-up WP: WP-M14-147a, WP-M14-147b, WP-M14-147c, WP-M14-147d (every
  document exists in this commit)
- Open question: none — the office answered the two questions: the message
  reaches the technicians who have a shift, and a confirmed, a swapped and a
  planned shift all count as a shift
