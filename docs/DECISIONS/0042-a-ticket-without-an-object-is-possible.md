# ADR-0042: a ticket without an object is possible

- Status: accepted
- Date: 2026-11-20
- Stakeholders: office, product

## Context

Every ticket of StörDesk points at exactly one object: `tickets.object_id` is
`NOT NULL` and references `objects.id` (`PLAN.md` §6, `apps/api/src/db/schema.ts`).
The office reports that customers without a contract of the installation call in
malfunctions that cannot be attached to any object of the list: there is no
`contracts_refs` / „Vertrag" table (deferred by ADR-0008) and the public report
form always carries a QR token of an object. The office needs

1. an internal ticket without an object,
2. a free text field in which the data of the foreign object can be stored
   (name, address, contact — even though it is not one of our contract
   customers),
3. the ticket to land with priority `low`,
4. a statistical view of how many tickets arrived without an object
   („wieviele Tickets von nichtvertragskunden").

## Decision

A ticket remains bound to a real object row — `object_id` stays `NOT NULL`, all
joins, the timeline, the escalation and the statistics views keep working
unchanged. The installation provisions one reserved object row in `objects`
(hand-written migration, fixed UUID, object number `OHNE-OBJEKT`, name
„Ohne Objekt", active, no QR token, no external id). Picking that object in the
internal create form means „no object"; the form then shows an additional free
text field, stored in the new nullable column `tickets.object_info_text`.

The priority of such a ticket is not a new rule: the reserved object carries a
row in `object_priority_overrides` with priority `low`, so the existing
resolution of ADR-0029 (explicit choice → object deviation → instance standard)
yields `low` automatically and the deadline length follows the priority as
usual.

The object list marks the reserved row `pinned`; it sorts last, is offered in
the internal object picker, is excluded from QR codes, stickers and the CSV
import, and cannot be soft-deleted through the object API. Public reports and
the QR resolution never see it (it has no token).

Statistics gain the filter `withoutObject` on `GET /api/v1/stats/*` so the
office can count tickets without an object per period; the reserved object also
appears as a row of the top-objects list.

## Consequences

- Every ticket has exactly one object row; no ticket is „object-less" in the
  database — „without an object" is the choice of the reserved object.
- The free text may carry names and addresses of foreign customers: it is
  PII-relevant, retention follows ADR-0014, and it never appears in logs,
  tests or fixtures as plaintext.
- The object number `OHNE-OBJEKT` is reserved forever; a later phase may add a
  real `contracts_refs` notion and re-decide what „not our contract customers"
  means.
