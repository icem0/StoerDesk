# WP-M5-03: the idempotent internal action helper (api)

format: small-model
status: planned
depends-on: WP-M5-02, WP-M2-19b
phase: 5
milestone: m5
context-budget: 16k tokens
spec: PLAN.md §10 ("the server validates replay; conflicts are returned"), PLAN.md §7 (workflow)
spec-lines: 40

files-read:

- apps/api/src/tickets/workflow.ts — `transitionTicket` and `TicketTransitionError`
- apps/api/src/db/schema.ts — `internalActionReceipts`, `ticketEvents`, `tickets`
- apps/api/src/tickets/duplicates.ts — the append-only `comment` event insert
- apps/api/src/tickets/__tests__/ — the existing API unit test pattern

files-write:

- apps/api/src/tickets/internal-actions.ts — the `applyInternalAction` helper
- apps/api/src/tickets/__tests__/internal-actions.spec.ts — unit tests

interfaces:

- `applyInternalAction(ctx: { database: Db; ticketNo: string; clientUuid: string;
  action: 'acknowledge' | 'comment' | 'decline'; actorUserId: string;
  payload?: Record<string, unknown> }): Promise<{ replayed: boolean;
  ticket: Ticket; event: TicketEvent }>`
- replay short-circuit: an existing receipt for `clientUuid` answers with the
  stored event and `replayed: true` and writes nothing
- actor binding: a receipt whose `actor_user_id` differs from `actorUserId`
  throws `TicketTransitionError(403, 'action_actor_mismatch', …)`
- an invalid state-machine transition keeps throwing `invalid_transition`
  (409) with the current ticket status in `params` — the conflict signal of
  WP-M5-04/07; no receipt is written for it

## Task

One service function all three internal action routes share (WP-M5-04), so the
replay validation of `PLAN.md` §10 lives in exactly one place.

1. `internal-actions.ts`: resolve the ticket by `ticketNo` (404 `ticket_not_found`
   if missing), look up the receipt by `client_uuid` and short-circuit a replay.
2. For `acknowledge` and `decline` call `transitionTicket` with the mapped event
   (`acknowledged`, `declined`) inside the same transaction as the receipt
   insert; for `comment` insert one append-only `ticket_events` row
   (`type: 'comment'`, `actorKind: 'user'`) and no status change.
3. Write the receipt (`client_uuid`, `ticket_id`, `actor_user_id`, `action`,
   `event_id`) only when the action executed; never for a conflict.
4. Unit tests: first execution writes event + receipt, second execution with the
   same `client_uuid` returns `replayed: true` with no second event, a foreign
   actor gets 403, an invalid transition gets 409 with `from` in `params` and no
   receipt, a comment leaves `tickets.status` untouched.

## Non-goals

- No HTTP routes and no Zod change — WP-M5-04.
- No claim/accept/offline-pool actions: claiming stays online-only
  (`specs/09-offline.md` §9.6).
- No conflict persistence on the server: conflicts are decided by the client
  outbox row (WP-M5-07).

## Acceptance

```bash
npm run typecheck -w @stoerdesk/api
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new spec fails before the change and passes after.

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: WP-M5-04 (`m5/04-internal-action-routes-idempotency.md`)
- Open question: none
