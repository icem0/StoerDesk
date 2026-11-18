# WP-M14-134e: the ticket takes the priority of the object

format: small-model
status: planned
phase: 14
milestone: m14
context-budget: 20k tokens
spec: specs/06-report-form.md §7.2, §7.5; specs/02-data-model.md §4.3.2; ADR-0029
spec-lines: 30

depends-on: WP-M14-134d

files-read:

- apps/api/src/tickets/internal.ts (the internal create)
- apps/api/src/tickets/report.ts (the public report of the QR form)
- apps/api/src/objects/priority.ts (the priority module of WP-M14-134c)
- packages/shared/src/schemas/ticket.ts (the internal create request)

files-write:

- packages/shared/src/schemas/ticket.ts
- apps/api/src/tickets/internal.ts
- apps/api/src/tickets/report.ts

interfaces:

- `internalCreateTicketRequestSchema.priority` is optional — without it the
  ticket takes the deviation of the object, else the standard
- The ticket of a QR report carries the effective priority of its object

## Task

1. In `packages/shared/src/schemas/ticket.ts`, the `priority` of the internal
   create request becomes optional: it keeps its check over the four
   priorities, but the default `normal` goes away — a request without a
   priority lets the server resolve it.
2. In `apps/api/src/tickets/internal.ts`, the priority of the ticket is the
   submitted one, else the deviation of the object, else the standard. The
   deadline of the ticket is computed from that priority.
3. In `apps/api/src/tickets/report.ts`, the priority of the QR report is the
   effective priority of the object — the deviation, else the standard — and
   the deadline uses the hours of that priority.
4. Add integration tests: a ticket without a priority takes the deviation of
   the object, a ticket with a priority keeps it, and a QR report of an object
   with a deviation carries it.

## Non-goals

- No change of the external API — the priority of the request wins there
  (ADR-0029, decision 5).
- No change of the priority of an existing ticket.
- No form of the web app yet (WP-M14-134i preselects the priority of the
  object).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; a QR report of a deviating object carries its priority.

## Handoff

- Files changed: the internal request schema, the internal create, the public
  report
- Interfaces added: the optional priority of the internal create request
- Verified: `npm run check` (exit 0), the integration specs of the two creates
- Follow-up WP: WP-M14-134f (the object form carries the priority)
- Open question: none
