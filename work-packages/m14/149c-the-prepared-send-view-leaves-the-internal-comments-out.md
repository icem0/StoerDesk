# WP-M14-149c: the prepared send view leaves the internal comments out

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 12k tokens
spec: docs/DECISIONS/0034-the-internal-comment-never-leaves-the-office.md; specs/01-rbac.md §3.3
spec-lines: 20

depends-on: WP-M14-149b

files-read:

- apps/web/src/features/tickets/ticket-send-page.tsx (the history of the prepared view)
- packages/shared/src/schemas/ticket.ts (the list of WP-M14-149b)
- apps/web/src/features/tickets/__tests__/ticket-send-page.test.tsx (the test of the view)

files-write:

- apps/web/src/features/tickets/ticket-send-page.tsx
- apps/web/src/features/tickets/__tests__/ticket-send-page.test.tsx

interfaces:

- `isInternalTicketEvent(type)` — the predicate of the shared contract
- the history of the prepared send view — without the internal comments

## Task

1. `apps/web/src/features/tickets/ticket-send-page.tsx`: the history of the
   prepared view leaves the internal comments out — the filter of
   `isInternalTicketEvent` runs over the events before they are rendered. The
   view is the printout (the A4 print CSS) and the source of the HTML copy for
   the e-mail program, so the note never reaches the customer.
2. The same file: the module comment names the rule — the history of the
   prepared view shows the events of the customer, never the internal
   comments.
3. The web test: the prepared view shows the normal comment and leaves the
   internal comment out; the copy for the e-mail carries the normal comment
   only.

## Non-goals

- No change of the ticket view: the internal comment stays visible there.
- No change of the public status page: it never carried a comment.
- No change of the fields, the photos and the rest of the prepared view.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new test fails before the change and passes after it.

## Handoff

- Files changed: the prepared send view, its test, this document, the backlog,
  the changelog, `PLAN.md` §16
- Interfaces added: none — the view uses the predicate of WP-M14-149b
- Verified: `npm run check`
- Follow-up WP: WP-M14-149d (the colour of the internal comment in the
  settings)
- Open question: none
