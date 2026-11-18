# WP-M14-149: the internal comment never leaves the office — the spec, ADR-0034 and the split

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 20k tokens
spec: specs/01-rbac.md §3.3, §3.4; specs/02-data-model.md §4.9; specs/09-offline.md §9.6; docs/DECISIONS/0034-the-internal-comment-never-leaves-the-office.md
spec-lines: 90

depends-on: WP-M14-148

files-read:

- specs/01-rbac.md (§3.3 the matrix, §3.4 the catalogue)
- specs/02-data-model.md (§4.9 the events of the trail)
- specs/09-offline.md (§9.6 the internal writes)
- apps/api/src/tickets/internal.ts (the comment route)
- apps/web/src/features/tickets/ticket-send-page.tsx (the print and e-mail view)
- apps/web/src/features/tickets/ticket-detail-page.tsx (the comment field)

files-write:

- specs/01-rbac.md, specs/02-data-model.md, specs/09-offline.md, docs/DECISIONS/0034-the-internal-comment-never-leaves-the-office.md, docs/DECISIONS.md
- PLAN.md (§16 the record), work-packages/README.md, CHANGELOG.md
- work-packages/m14/149-the-internal-comment-never-leaves-the-office.md (this file)
- work-packages/m14/149a-…, 149b-…, 149c-…, 149d-…, 149e-…, 149f-…, 149g-…

interfaces:

- `ticket_events.type = 'internal_comment'` — the event type of the note that stays in the house
- `ticket.comment.internal` — the permission key of the internal comment; it belongs to no default role
- `POST /api/v1/tickets/:ticketNo/comments/internal` (behind the key) — the write of the note
- `GET /api/v1/settings/display` (`ticket.read`) — the colour of the internal comment
- `PUT /api/v1/settings/branding` (`settings.write`) — the colour in the row of the Darstellung

## Task

**The comment of the office (out of band in phase 14).** „wir müssen in der
kommentarfunktion einen zusätzlichen internen kommentar einfügen! dieser darf
niemals gedruckt oder per E-Mail an den Kunden gehen … es soll einen eigenen
berechtigungs key dafür geben sodass man ihn an mitarbeiter vergeben kann …
die kommentare sollen in einer besonderen hintergrundfarbe ein textfeld erhalten
in einem dunklen rot diese farbe soll man aber unter darstellung konfigurieren
können“.

The comment function of the ticket view gains a second kind of comment: the
internal comment. It never reaches the customer — neither in the printout nor
in the e-mail of the prepared send view. It has its own permission key, which
the administration grants to the colleagues who may write it, and it is
recognisable at a glance by a dark red background whose colour the
administration configures under „Darstellung“.

ADR-0034 decides the shape: the internal comment is its own event type of the
trail (no migration, the type column has no check constraint), the key belongs
to no default role, the guarantee „never printed, never sent“ is a rule of the
send view and not a rule the office has to remember, the colour is a hex value
of the instance and the write stays offline-capable.

The decision splits into seven packages:

1. **WP-M14-149a** — the catalogue: the key `ticket.comment.internal`.
2. **WP-M14-149b** — the API: the route of the internal comment and the shared
   contract of the event type.
3. **WP-M14-149c** — the web: the prepared send view leaves the internal
   comments out.
4. **WP-M14-149d** — the API: the colour of the internal comment in the
   settings.
5. **WP-M14-149e** — the web: the colour under „Darstellung“.
6. **WP-M14-149f** — the web: the offline queue carries the internal comment.
7. **WP-M14-149g** — the web: the ticket view writes and shows the internal
   comment.

This package writes no product code.

## Non-goals

- No change of the normal comment: it stays the comment that travels to the
  customer with the prepared send view.
- No new table, no migration: the event type and the settings row carry the
  feature.
- No hiding of the internal comments from the colleagues: the key guards the
  write, the notes stay visible for everyone who may read the ticket.

## Acceptance

```bash
npm run i18n:check
npm run wp:check
```

Expected: all green; the spec names the key, the event type and the colour, the
ADR carries the decision with its alternatives, and the seven child documents
exist.

## Handoff

- Files changed: the RBAC, data model and offline specs, the ADR and its index,
  `PLAN.md` §16, this document and the seven child documents, the backlog, the
  changelog
- Interfaces added: the event type `internal_comment`, the key
  `ticket.comment.internal`, the route
  `POST /api/v1/tickets/:ticketNo/comments/internal`, the route
  `GET /api/v1/settings/display` and the colour in the branding row
- Verified: `npm run wp:check`, `npm run i18n:check`
- Follow-up WP: WP-M14-149a, WP-M14-149b, WP-M14-149c, WP-M14-149d, WP-M14-149e,
  WP-M14-149f, WP-M14-149g (every document exists in this commit)
- Open question: none — the office named the three rules: the note never leaves
  the house, it has its own key, and its colour is configurable under
  „Darstellung“
