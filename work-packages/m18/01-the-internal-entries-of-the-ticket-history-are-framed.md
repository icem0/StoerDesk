# WP-M18-01: the entries of the house in the ticket history are framed

format: small-model
status: done
phase: 18
milestone: m18
context-budget: 20k tokens
depends-on: WP-M14-149g, WP-M14-149d, WP-M16-06
spec: docs/DECISIONS/0038-the-internal-entries-of-the-ticket-history-are-framed.md;
  specs/13-ui.md §14.7; docs/DECISIONS/0034-the-internal-comment-never-leaves-the-office.md
spec-lines: 120

files-read:

- packages/shared/src/schemas/ticket.ts (the list of the internal event types)
- apps/web/src/features/tickets/ticket-detail-page.tsx (the history rows)
- apps/web/src/features/tickets/ticket-send-page.tsx (the filter of the printout)
- apps/web/src/features/tickets/__tests__/ticket-detail-escalation.test.tsx
- apps/web/src/features/tickets/__tests__/ticket-send-page.test.tsx
- docs/DECISIONS/0034-the-internal-comment-never-leaves-the-office.md

files-write:

- packages/shared/src/schemas/ticket.ts
- apps/web/src/features/tickets/ticket-detail-page.tsx
- apps/web/src/features/tickets/__tests__/ticket-detail-escalation.test.tsx,
  apps/web/src/features/tickets/__tests__/ticket-send-page.test.tsx
- specs/13-ui.md, docs/DECISIONS/0038-…, docs/REPO-MAP.md, CHANGELOG.md,
  work-packages/README.md, PLAN.md §16, this document

interfaces:

- `INTERNAL_TICKET_EVENT_TYPES` — the event types that stay in the house
- `isInternalTicketEvent(type: string): boolean` — unchanged predicate
- the framed history row `data-testid="history-internal"` in the ticket view

## Task

**The comment of the office (phase 18).** „in der tiketansicht sind im verlauf
bestenteintiegstorie nur intern sichtbar … ich will das alle internen verlaatife
ghojkennaltetmenten mit em rahmen mit farbe“ — the history of a ticket mixes the
steps of the ticket with the chatter of the house: the firing of a rule, an
escalation note, the delivery of a message with its channel, its addressee and
its target, the internal comment. Only the internal comment had a background
block; nothing said at a glance which rows never left to the customer.

1. `packages/shared/src/schemas/ticket.ts`: the list `INTERNAL_TICKET_EVENT_TYPES`
   names the rows of the house — `internal_comment`, `escalated`,
   `escalation_set`, `escalation_note`, `notification_sent`,
   `notification_failed`. The workflow steps and the steps of the pause stay
   outside (ADR-0038 decision 1). `isInternalTicketEvent` stays the predicate.
2. `apps/web/src/features/tickets/ticket-detail-page.tsx`: a history row of an
   internal event type carries a **frame** — `rounded-lg border-2` with
   `borderColor: internalCommentColor` beside a faint backdrop. The colour is
   the one the administration sets under „Darstellung“ (WP-M14-149d); the dark
   red stays the default. The row keeps its localized event name, so the mark is
   a shape and no colour alone (§14.2). The framed row carries
   `data-testid="history-internal"`.
3. `apps/web/src/features/tickets/__tests__/ticket-detail-escalation.test.tsx`:
   the internal comment, an escalation note, a failed delivery and the historic
   `escalation_set` row are framed in the colour the display route answers
   (`#450a0a`), the rows `Zugewiesen` and the report entry are not.
4. `apps/web/src/features/tickets/__tests__/ticket-send-page.test.tsx`: an
   escalated row and a `notification_sent` row with a recipient and a target
   never reach the printout and the clipboard of the e-mail (ADR-0038 decision 3).
5. `specs/13-ui.md` gains §14.7, `docs/DECISIONS/0038-…md` carries the decision.

## Non-goals

- No API, schema, migration, permission or route change: the shared list is
  consumed by the ticket view and by the prepared send view only.
- No second colour and no new field under „Darstellung“: the frame wears the
  colour `internalCommentColor` already offers (ADR-0038 decision 2).
- No change of the public status page: it answers `PUBLIC_TICKET_EVENT_TYPES`
  and never knew the internal types.
- No frame in the timeline, in the ticket list or in the notification inbox.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new assertions fail before the change and pass after it.

## Handoff

- Files changed: the shared ticket contract, the ticket detail page, the two web
  tests, `specs/13-ui.md` §14.7, `docs/DECISIONS/0038-…`, `docs/REPO-MAP.md`,
  `CHANGELOG.md`, `work-packages/README.md`, `PLAN.md` §16
- Interfaces added: `INTERNAL_TICKET_EVENT_TYPES` gains four event types; the
  framed history row `data-testid="history-internal"`
- Verified: `npm run check` (see the run report of this session)
- Follow-up WP: none
- Open question: none
