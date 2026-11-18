# WP-M14-149f: the offline queue carries the internal comment

format: small-model
status: planned
phase: 14
milestone: m14
context-budget: 14k tokens
spec: specs/09-offline.md §9.6; docs/DECISIONS/0034-the-internal-comment-never-leaves-the-office.md
spec-lines: 30

depends-on: WP-M14-149e

files-read:

- apps/web/src/lib/outbox.ts (the queue of the internal writes)
- apps/web/src/features/tickets/use-internal-actions.ts (the hook of the queue)
- apps/web/src/lib/sw-routes.ts (the routes of the service worker)

files-write:

- apps/web/src/lib/outbox.ts
- apps/web/src/features/tickets/use-internal-actions.ts
- apps/web/src/lib/sw-routes.ts
- apps/web/src/lib/__tests__/outbox-actions.test.ts

interfaces:

- `InternalActionKind` — the kind `internal_comment` joins the three kinds
- `ACTION_SEGMENTS` — the route `comments/internal` for the new kind
- `isInternalTicketWrite(pathname)` — matches the route of the internal comment

## Task

1. `apps/web/src/lib/outbox.ts`: the kind `internal_comment` joins
   `InternalActionKind`, and `ACTION_SEGMENTS` maps it to the route
   `comments/internal`. The replay of the row posts it to its own route — an
   internal comment is never queued as a normal comment, because a normal
   comment is printed with the prepared send view.
2. `apps/web/src/features/tickets/use-internal-actions.ts`: the hook queues the
   new kind.
3. `apps/web/src/lib/sw-routes.ts`: the predicate of a write matches the route
   of the internal comment — the path has two segments after the ticket number,
   so the rule of one segment does not reach it. A write of the internal
   comment drops the cached copy of the ticket, so the note shows up at once.
4. The web test: the kind maps to its route, the replay of a row of the kind
   posts to the route of the internal comment and the predicate matches the
   path.

## Non-goals

- No change of the three existing kinds and of the queue of the reports.
- No new table of the queue: the kind is a value of the existing table.
- No change of the ticket view: the view queues the note in WP-M14-149g.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new tests fail before the change and pass after it.

## Handoff

- Files changed: the queue, the hook of the queue, the routes of the service
  worker, the tests, this document
- Interfaces added: the kind `internal_comment`, the route `comments/internal`
- Verified: `npm run check`
- Follow-up WP: WP-M14-149g (the ticket view writes and shows the internal
  comment)
- Open question: none
