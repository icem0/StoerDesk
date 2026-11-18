# ADR-0029: The priority of an object deviates from the standard

- Status: accepted
- Date: 2026-11-18
- Stakeholders: office, manager, administrator

## Context

The office asks for two things that the plan names but does not implement: the
priority is set per object, and the standard values are set in the
administration.

Today the priority of a ticket is only a field of the request
(`packages/shared/src/schemas/ticket.ts`, `internalCreateTicketRequestSchema`):
an internal report chooses it, a public QR report always starts as `normal`
(`apps/api/src/tickets/report.ts`). The `objects` table carries no priority
(`apps/api/src/db/schema.ts`), and the plan names `contracts_refs` as
"optional object-level AA/SA default" — a table that does not exist anywhere.
`PLAN.md` §19 marks the per-object dimension as an open decision that needs an
ADR before a work package.

The deadline per priority is already configurable (ADR-0008) and lives in the
administration (`/admin/escalation`, tab "Fristen"). The standard *priority*
itself is not configurable: it is hard-coded as `normal` in the create form and
in the report route.

## Decision

1. **The standard is a setting.** The `settings` row `ticket.default_priority`
   holds the standard priority; without a row the standard is `normal`. It is
   written under the permission `settings.write` and read under
   `settings.read`, in the new page `/admin/defaults` ("Standardwerte").

2. **The deviations live in a parallel table.** `object_priority_overrides`
   holds only the objects whose priority differs from the standard:
   `object_id` uuid primary key, foreign key to `objects(id)` with
   `ON DELETE CASCADE`; `priority` text not null with the check over `low`,
   `normal`, `high`, `critical`; `created_at` and `updated_at` (migration
   `0050`). The object number is the key of the object list outside the
   database; inside the database the row points at the uuid of the object.

3. **The effective priority of an object** is the row of the table, else the
   standard. The object summary carries it as `priority`; the object write
   accepts `priority` (nullable): `null` removes the row, a value stores it. A
   value that equals the standard removes the row as well — the table holds
   only deviations, that is its invariant.

4. **Changing the standard prunes the table.** When the standard changes, the
   rows that now equal the standard are deleted in the same transaction: a
   deviation that no longer deviates is not stored.

5. **The priority of a new ticket:**
   - the internal report: the explicit choice of the user wins; the form
     preselects the effective priority of the chosen object, so the deviation
     applies unless the user chooses another priority. A request without a
     priority takes the deviation of the object, else the standard.
   - the public QR report: the reporter chooses no priority — the deviation of
     the object wins, else the standard. This replaces the fixed `normal`.
   - the external API: the priority of the request wins; the caller decides.
   The ticket keeps the priority of its creation; a later change of the
   standard or of a deviation never touches an existing ticket.

6. **`contracts_refs` stays deferred.** This table takes over the priority part
   of the object-level default of `PLAN.md` §6. The service level (AA/SA) of
   the contract remains an open decision.

## Alternatives

- **A `priority` column on `objects`** — rejected: every row would carry the
  standard, and "no deviation" would be indistinguishable from "the deviation
  is normal". The column would also be written for every object of the list.
- **The deviations as a JSON column on `objects`** — rejected: no referential
  integrity, no index, and no cascade when the object is deleted.
- **A column with the priority per object type ("Objektart")** — still open
  (`PLAN.md` §19). The table can carry that scope later; a second table would
  have to be migrated again.
- **Only the deadline hours per priority, no priority per object** — rejected:
  the office asked for the priority per object.

## Consequences

- A critical object (a clinic) starts every report in `critical` and therefore
  in the short deadline of 8 h.
- The administration shows the standard and the list of the deviations; the
  object form shows the deviation of one object.
- The QR report of an object with a deviation is no longer `normal`: the status
  page and the notification carry the priority of the object.
- The object list carries one more field, the effective priority — the list
  shows it as a badge.
- Follow-up: the priority per object type (Objektart) can use the same table.
