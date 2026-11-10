# WP-M5-10: comment POST sends its client uuid and action errors stop showing the delete text

format: small-model
status: done
depends-on: WP-M5-04, WP-M5-05
phase: 5
milestone: m5
context-budget: 18k tokens
spec: PLAN.md §10 (offline writes go into the outbox, replayed in order)
spec-lines: 20

files-read:

- apps/web/src/features/tickets/ticket-detail-page.tsx — the action POSTs and error rendering
- apps/api/src/tickets/internal.ts — the comment body `{ clientUuid, text }`
- apps/web/src/lib/outbox.ts — how queued actions carry their `clientUuid`
- apps/web/src/i18n/locales/de/ticket.json and `en/ticket.json` — `detail.errors.*`

files-write:

- apps/web/src/features/tickets/ticket-detail-page.tsx
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json
- work-packages/m5/10-comment-client-uuid-fix.md (this file)

interfaces:

- the online comment action POSTs `{ clientUuid, text }` like the queued replay does.
- a failed workflow action renders `detail.errors.actionFailed`, never the delete text.

## Task

Adding a comment from the ticket detail page always fails immediately with
"Die Meldung konnte nicht gelöscht werden.".

Root cause: `POST /api/v1/tickets/:ticketNo/comments` requires
`clientUuid: uuid` (`apps/api/src/tickets/internal.ts`), but the online
`handleAction('commented', …)` sends only `{ text }`. The API answers
`400 invalid_request`, and the detail page maps every action error through the
delete-error helper, whose default is `detail.errors.deleteFailed`.

1. `ticket-detail-page.tsx`: in `handleAction`, add a fresh
   `crypto.randomUUID()` as `clientUuid` to the `comments` body so the POST
   matches the route contract and shares the idempotency receipt with the outbox.
2. `ticket-detail-page.tsx`: split the error mapping — workflow actions use
   `detail.errors.actionFailed` as their default, delete keeps
   `detail.errors.deleteFailed` and its specific `ticket_delete_*` codes.
3. `ticket-detail-page.tsx`: render `lastError` directly below the page header
   instead of at the bottom after the history, so the alert is visible where the
   action happens.
4. `ticket-detail-page.tsx`: pull the comment input out of the options dropdown
   into an always-visible comment box above the history (textarea + submit,
   disabled while empty). Add `detail.comment.submit` to de/en.

## Non-goals

- No API change; the route contract stays `{ clientUuid, text }`.
- No new `detail.errors.*` key; `detail.errors.actionFailed` already exists.
- No redesign of the rest of the dropdown or the offline banner.

## Acceptance

Run and report the exact commands:

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected result: all green.

## Handoff

- Files changed: `apps/web/src/features/tickets/ticket-detail-page.tsx`, `apps/web/src/i18n/locales/de/ticket.json`, `apps/web/src/i18n/locales/en/ticket.json`
- Interfaces added: none
- Verified: `npm run typecheck -w @stoerdesk/web`, `npm run lint` (0 errors, 7 pre-existing warnings), `npm run test:run` (456 passed, 436 integration tests skipped without a database), `npm run i18n:check` (1056/1056), `npm run wp:check` (323 checked, 0 failed)
- Follow-up WP: none
- Open question: none
