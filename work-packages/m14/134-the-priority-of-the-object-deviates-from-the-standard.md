# WP-M14-134: the priority of the object deviates from the standard — ADR-0029, the spec and the split

format: small-model
status: planned
phase: 14
milestone: m14
context-budget: 20k tokens
spec: specs/02-data-model.md §4.3.2; specs/08-objects-api.md §9.1; specs/06-report-form.md §7.2, §7.5; PLAN.md §6, §10, §19
spec-lines: 60

depends-on: WP-M14-133

files-read:

- PLAN.md (§6 the data model, §10 the report form, §19 the open decisions)
- specs/02-data-model.md (§4.3 the object list)
- specs/08-objects-api.md (§9.1 the object summary and the write)
- specs/06-report-form.md (§7.2 the fields, §7.5 what one report writes)
- docs/DECISIONS/0008-deadline-and-escalation-defaults.md (the defaults of ADR-0008)

files-write:

- docs/DECISIONS.md, docs/DECISIONS/0029-the-object-priority-deviates-from-the-standard.md
- specs/02-data-model.md (§4.3.2), specs/08-objects-api.md (§9.1), specs/06-report-form.md (§7.2, §7.5)
- PLAN.md (§6 the tables, §10 the priority, §19 the open decisions)
- work-packages/m14/134a-…, 134b-…, 134c-…, 134d-…, 134e-…, 134f-…, 134g-…, 134h-…, 134i-…

interfaces:

- `ADR-0029` — the standard priority is the setting `ticket.default_priority`,
  the deviations live in `object_priority_overrides` and hold only what differs
  from the standard
- `object_priority_overrides` — `object_id` (uuid, primary key, foreign key to
  `objects` with `ON DELETE CASCADE`), `priority` (text, not null, check over
  `low`, `normal`, `high`, `critical`), `created_at`, `updated_at`
- The object summary carries `priority` (the effective priority) and
  `priorityOverride` (the stored deviation, nullable)

## Task

**The comment of the office (out of band in phase 14).** „wir machen einen
parallelen tabelle in der nur die abweichungen vom standard mit der
objektnummer verknüpft wird" — the priority is set per object, and the standard
values are set in the administration. The plan names both as open: the priority
of a ticket is today only a field of the request, and the standard priority is
hard-coded as `normal`.

**ADR-0029** decides: the standard is the setting `ticket.default_priority`
(default `normal`), the deviations live in the parallel table
`object_priority_overrides`, and the table holds **only** deviations — a value
that equals the standard removes the row, and changing the standard deletes the
rows that no longer deviate. The effective priority of an object is its
deviation, else the standard. A new ticket takes the deviation of the object:
the internal form preselects it, the QR report has no other choice. The
external API keeps the priority of the request.

The decision splits into nine packages:

1. **WP-M14-134a** — the table `object_priority_overrides` (migration `0050`).
2. **WP-M14-134b** — the shared contracts of the priority and of the standard.
3. **WP-M14-134c** — the service reads and writes the deviation.
4. **WP-M14-134d** — the routes answer the standard and the list of the deviations.
5. **WP-M14-134e** — the ticket takes the priority of the object.
6. **WP-M14-134f** — the object form carries the priority.
7. **WP-M14-134g** — the administration shows the standard and the deviations.
8. **WP-M14-134h** — the route and the menu entry of the defaults page.
9. **WP-M14-134i** — the internal create form starts from the priority of the object.

This package writes no product code.

## Non-goals

- No `contracts_refs` table (PLAN.md §6): the service level (AA/SA) of the
  contract stays an open decision, ADR-0029 takes over the priority only.
- No priority per object type ("Objektart") — it needs its own ADR
  (PLAN.md §19).
- No change of the deadline hours per priority (ADR-0008).
- No change of the priority of an existing ticket.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the ADR, the spec slices and the nine child documents are
in the repository.

## Handoff

- Files changed: the ADR, the three spec slices, PLAN.md §6/§10/§19
- Interfaces added: `ADR-0029`, `object_priority_overrides`, the two priority
  fields of the object summary
- Verified: `npm run check` (exit 0), `npm run wp:check`
- Follow-up WP: WP-M14-134a … WP-M14-134i (every document exists in this commit)
- Open question: none
