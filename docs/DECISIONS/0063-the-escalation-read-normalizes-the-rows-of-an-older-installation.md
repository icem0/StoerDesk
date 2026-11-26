# ADR-0063: The escalation read normalizes the rows of an older installation

- Status: accepted
- Date: 2026-11-26
- Stakeholders: office, administration, escalation engine

## Context

The escalation configuration lives in the rows `escalation_stages`,
`escalation_rules` and `escalation_actions`. The read
(`readEscalationConfig`) hands those rows to the current contract
(`escalationConfigSchema`) and the administration shows the result; the
escalation scan reads the same rows.

The contract tightened while the installation stayed: a configuration that was
edited in an older version carries rows of the former shape — an empty
condition as `{}` or `null`, an `assign` action naming its mode and the
technician of the pool of the office (ADR-0039, decision 3), a `notify`
action without any recipient, `acceptance` as a text, a rule that carries
both clocks, a reference outside the clock of its stage, a stage without a
name for a required locale or with the position of the row default `0`. The
parse then threw an uncaught ZodError, the route answered a bare `500` and
the escalation administration showed the text of a failed save —
"Speichern fehlgeschlagen." — without loading. The escalation scan failed
the same silent way.

## Decision

1. **The read normalizes the legacy rows into the contract.** The listed
   shapes become their current meaning: an empty condition is the empty
   condition of §7.4 (`{ all: [] }`), the technician of the former `assign`
   action is a target of the kind `user`, an action that named the pool of
   the office is dropped (the rule of the migration of WP-M32-05), a
   `notify` action without a recipient is dropped
   (`notify_needs_target_or_channel`), a rule that carries both clocks
   keeps the clock its stage says (§7.2, §7.5), a reference outside the
   clock of its stage falls back to the stage clock (the fallback of
   `writeEscalationStages`, ADR-0023), a stage without a name for a
   required locale takes its key (the fallback of `localizedName`) and a
   stage with the position `0` takes its place in the order.
2. **The read never rewrites the database.** The normalization lives in the
   read only; the administration writes the rows again when the user saves,
   and the rows then follow the contract.
3. **A configuration that still cannot be parsed answers a code.** The route
   answers `500` with `{ code: config_invalid, params: { fields } }` — the
   field paths of the contract (§3, §3.7): a failed load is never a bare
   server error and never the text of a failed save.
4. **The administration names the code of the answer.** `config_invalid` and
   the fallback of a load that failed have their own texts
   (`admin.escalation.errors.config_invalid`, `admin.escalation.errors.load`);
   the text of a failed save stays where a save failed.

## Consequences

An existing installation opens the escalation administration after this
change, and the escalation scan keeps its rules. A row that names the pool
of the office or an action without a recipient is not displayed and never
fires — both could not fire before either. A configuration outside every
listed shape answers `config_invalid` with the field paths, so the office
sees which rule it has to correct.
