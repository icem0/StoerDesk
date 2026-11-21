# WP-M18-02: a ticket without an object — spec, ADR and the split

format: small-model
status: done
depends-on: —
phase: 18
milestone: m18
context-budget: 24k tokens
spec: PLAN.md §6, §7, §13, §16; specs/02-data-model.md §4.3, §4.8; PLAN.md §7 rule 1
spec-lines: 95

files-read:

- PLAN.md §6 (data model), §7 (ticket workflow), §13 (dashboard)
- specs/02-data-model.md §4.3 (objects), §4.8 (tickets)
- PLAN.md §7 rule 1 (create)
- apps/api/src/tickets/internal.ts (existing internal creation)
- packages/shared/src/schemas/ticket.ts (internal contract)

files-write:

- docs/DECISIONS/0042-a-ticket-without-an-object-is-possible.md
- docs/DECISIONS.md, work-packages/README.md, PLAN.md §7 (rule 1), §16 (phase note)
- specs/02-data-model.md (§4.3.3 the object „Ohne Objekt“, §4.8 `object_info_text`)

interfaces:

- ADR-0042: tickets keep `object_id NOT NULL`; a seeded, reserved object row („Ohne Objekt", objectNo `OHNE-OBJEKT`) stands in for customers without a contract; the ticket gains nullable `object_info_text` with the free description of the foreign object; priority resolves via `object_priority_overrides` of that object (`low`, ADR-0029); the object list pins the row last; stats filter `withoutObject`.
- `tickets.object_info_text: text` — nullable, no default

## Task

1. docs/DECISIONS/0042-a-ticket-without-an-object-is-possible.md — ADR-0042: context (every ticket needs an object today; the office needs tickets for customers without a contract, with a free description, countable statistically), decision (reserved seeded object row plus `object_info_text`, priority `low` via the object override, pinned object-list row, stats filter `withoutObject`), consequences (joins, timeline and escalation untouched because the object is a real row; dashboard and statistics count them under the reserved object number; deletion, QR, stickers and CSV import guarded; the free text is PII-sensitive — retention per ADR-0014, no PII in tests, fixtures or commits).
2. specs/02-data-model.md §4.3.3: the reserved object row; §4.8: the nullable `object_info_text` column of `tickets`.
3. PLAN.md §7 rule 1: the exception — creation without an object is the choice „Ohne Objekt"; deadline and priority follow the object's deviation, else the instance standard.
4. PLAN.md §16 current state: phase 18 continues with WP-M18-03 … WP-M18-07; docs/DECISIONS.md gains the ADR-0042 row and work-packages/README.md gains the backlog rows.

## Non-goals

- No nullable `object_id` — the foreign key stays `NOT NULL`.
- No `contracts_refs` / „Vertrag" table (deferred by ADR-0008); „not our Vertragskunden" means a ticket with the reserved object.
- No public or QR report path — public reports always carry an object token.
- No later re-assignment of such a ticket to a real object in this phase.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; `wp-check` reports the new work packages as planned.

## Handoff

- Files changed: docs/DECISIONS/0042-a-ticket-without-an-object-is-possible.md, docs/DECISIONS.md, specs/02-data-model.md, specs/03-ticket-workflow.md, PLAN.md §16, work-packages/README.md, this document
- Interfaces added: none yet (ADR and specs only)
- Follow-up WP: WP-M18-03, WP-M18-04, WP-M18-05, WP-M18-06, WP-M18-07 (each file created with its WP)
- Open question: none
