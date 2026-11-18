# WP-M14-150: the assignment names a technician and the notification reaches him — the spec and the split

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 20k tokens
spec: specs/07-escalation.md §7.5, §7.14; specs/02-data-model.md §4.13; PLAN.md §9
spec-lines: 90

depends-on: WP-M14-149

files-read:

- specs/07-escalation.md (§7.5 the actions, §7.14 the offer and the assign)
- specs/02-data-model.md (§4.13 `ticket_assignees`)
- packages/shared/src/schemas/escalation-config.ts (the target contracts)
- apps/api/src/escalation/distribution.ts (the distribution of a ticket)
- apps/api/src/escalation/actions.ts (the dispatcher of the actions)
- apps/web/src/admin/escalation-action-editor.tsx (the editor of the actions)

files-write:

- specs/07-escalation.md (§7.5 the two targets, §7.14 the technician and the recipient)
- docs/DECISIONS/0033-the-assignment-names-a-technician.md, docs/DECISIONS.md
- PLAN.md (§9 the two targets, §16 the record of the series)
- work-packages/m14/150-…, 150a-…, 150b-…, 150c-…, 150d-…

interfaces:

- the target of an `offer` and an `assign` action — `{ kind: 'pool' | 'group' | 'user', id }`
- the target of a `notify` action — `{ kind: 'user' | 'pool', id }` or `{ kind: 'assigned' }`
- the assignees of a ticket — the technicians of `ticket_assignees`

## Task

**The comment of the office (out of band in phase 14).** „bei der aktion
auftrag zuweisen in den einstellungen eskalationen muss es möglich sein, einem
techniker / mitarbeiter das ticket zuzuweisen … dieser assigned benutzer soll
dann auch im nachgang als assigned user (zugewiesen oder freiwillig nach
‚angeboten' angenommen) auswählbar sein um ihm eine nachricht zu schicken".

Two gaps in the escalation of ADR-0026 and ADR-0030:

1. The action „Ticket zuweisen" knows the target kinds `pool` and `group` — a
   whole team. The office wants to name **one** technician of the installation.
2. The action „Benachrichtigung" knows the target kinds `user` and `pool` — a
   fixed recipient. The office wants to address **the technician of the
   ticket**: the one the escalation assigned and the one who took the ticket
   himself after an offer.

The decision splits into four packages:

1. **WP-M14-150a** — the contracts of the new targets and their consumers: the
   kind `user` of the target of a distribution, the kind `assigned` of the
   target of a notification, the configuration service and the dispatcher.
2. **WP-M14-150b** — the engine: the distribution names the technician of a
   user target.
3. **WP-M14-150c** — the workflow: the claim and the acceptance of a ticket
   name the technician in `ticket_assignees`.
4. **WP-M14-150d** — the administration: the editor offers the technician and
   the assigned recipient.

This package writes no product code.

## Non-goals

- No migration: the table `ticket_assignees` exists (`§4.13`).
- No change of `tickets.assigned_user_id` — it stays the column of a single
  assignment.
- No per-user routing of the channels other than ntfy (ADR-0026, ADR-0030).
- No change of the ticket view: it already names the assignees (§7.14).

## Acceptance

```bash
npm run i18n:check
npm run wp:check
```

Expected: all green; the spec names the two targets, the ADR carries the
decision with its alternatives, and the four child documents exist.

## Handoff

- Files changed: the escalation spec, the ADR and its index, `PLAN.md` §9/§16,
  this document and the four child documents
- Interfaces added: the kind `user` of the target of a distribution, the kind
  `assigned` of the target of a notification
- Verified: `npm run wp:check`, `npm run i18n:check`
- Follow-up WP: WP-M14-150a, WP-M14-150b, WP-M14-150c, WP-M14-150d (every
  document exists in this commit)
- Open question: none — the office named the two gaps: the assignment names
  one technician, the notification reaches the technician of the ticket
