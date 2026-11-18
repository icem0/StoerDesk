# WP-M14-149g: the ticket view writes and shows the internal comment

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 18k tokens
spec: docs/DECISIONS/0034-the-internal-comment-never-leaves-the-office.md; specs/01-rbac.md §3.3
spec-lines: 30

depends-on: WP-M14-149f

files-read:

- apps/web/src/features/tickets/ticket-detail-page.tsx (the composer and the history)
- apps/web/src/i18n/locales/de/ticket.json (the texts of the ticket view)
- apps/web/src/features/tickets/__tests__/ticket-detail-comment.test.tsx (the test of the composer)

files-write:

- apps/web/src/features/tickets/ticket-detail-page.tsx
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json
- apps/web/src/features/tickets/__tests__/ticket-detail-comment.test.tsx

interfaces:

- the checkbox of the composer — writes the note instead of the comment
- `GET /v1/settings/display` — the colour of the field and of the entry
- `POST /v1/tickets/:ticketNo/comments/internal` — the write of the note
- the texts `detail.comment.internal.*` (de/en)

## Task

1. `apps/web/src/features/tickets/ticket-detail-page.tsx`: the composer gains
   the checkbox „Interner Kommentar“ — only with the permission
   `ticket.comment.internal`, read with `usePermission`. The checkbox changes
   the write: the note goes to the route of the internal comment, the normal
   comment keeps its route.
2. The same file: the field of the composer carries the background of the
   colour of the instance while the checkbox is on, and the entry of an
   internal comment in the history carries the same colour — the note is
   recognisable at a glance. The colour comes from
   `GET /v1/settings/display`; a colleague without an answer sees the default
   of the server.
3. The same file: the confirmation dialog names the rule — a note is never
   printed and never sent to the customer. The write of a note that fails
   without a connection is queued (WP-M14-149f), never turned into a normal
   comment.
4. The texts `detail.comment.internal.*` in `ticket` (de and en): the label of
   the checkbox, the hint, the button of the note and the text of the dialog.
5. The web test: the checkbox appears with the permission and stays away
   without it, the field carries the colour, the write goes to the route of the
   note and the history shows the entry in the colour.

## Non-goals

- No change of the normal comment: its field, its dialog and its route stay as
  they are.
- No change of the prepared send view: it leaves the note out (WP-M14-149c).
- No hiding of the note from the colleagues: the key guards the write.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new test fails before the change and passes after it.

## Handoff

- Files changed: the ticket view, the two locale files, the test, the security plan,
  this document, the backlog, the changelog, `PLAN.md` §16
- Interfaces added: the checkbox of the composer and the texts
  `detail.comment.internal.*`
- Verified: `npm run check`
- Follow-up WP: none — the chain of the internal comment is closed
- Open question: none
