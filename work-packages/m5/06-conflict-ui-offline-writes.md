# WP-M5-06: failed and conflicting offline writes stay visible (web)

format: small-model
status: planned
depends-on: WP-M5-05
phase: 5
milestone: m5
context-budget: 16k tokens
spec: PLAN.md §10 ("conflicts are returned and shown to the user"), specs/09-offline.md §9.5
spec-lines: 30

files-read:

- apps/web/src/lib/outbox.ts — the `conflict` status and `error_code` fields (WP-M5-01)
- apps/web/src/features/tickets/use-internal-actions.ts — the delivery result handling (WP-M5-05)
- apps/web/src/features/tickets/ticket-detail-page.tsx — where the banner renders
- apps/web/src/lib/api.ts — `ApiError` code and `params` access

files-write:

- apps/web/src/features/tickets/use-internal-actions.ts — conflict decision
- apps/web/src/features/tickets/offline-action-banner.tsx — the conflict/failed banner
- apps/web/src/features/tickets/__tests__/offline-action-banner.test.tsx — component test
- apps/web/src/i18n/locales/de/ticket.json and `en/ticket.json` — conflict texts

interfaces:

- delivery of a row answered `409 invalid_transition`, `404 ticket_not_found`
  or `403 action_actor_mismatch` → the row becomes `status: 'conflict'` with
  `error_code` and the server's current `ticket_status` from `params.from`;
  conflict rows are never auto-retried
- a network or `5xx` failure keeps `queued` with `retries + 1` (unchanged)
- `OfflineActionBanner` on the detail page lists the queued, failed and conflict
  rows of that ticket with `ticket.offlineConflict` (names the server status),
  one **retry** button (`deliverNow` once) and one **discard** button
  (`removeAction`) per conflict row
- the admin home outbox count (`pendingWrites`) counts conflict rows as pending

## Task

1. Extend the delivery result handling in the hook: map the three conflict
   codes to `conflict` plus `error_code`/`ticket_status`, everything else stays
   retryable.
2. New `offline-action-banner.tsx` rendered above the workflow buttons of the
   detail page; one line per pending row of the ticket, action kind and age,
   conflict reason in de/en, retry and discard buttons.
3. Retry runs a single `deliverNow` for that row; discard removes the row and
   the banner line (the user decides, the server never drops anything).
4. Component test: a conflict row renders the reason with the server status,
   discard removes it, a `queued` row offers no discard.

## Non-goals

- No merge or auto-resolution of conflicts — the user retries or discards.
- No outbox list page; the banner on the affected ticket is the conflict UI.
- No service-worker read cache — WP-M5-07.

## Acceptance

```bash
npm run typecheck -w @stoerdesk/web
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the banner test fails before the change and passes after.

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: WP-M5-07 (`m5/07-offline-ticket-reads-sw.md`)
- Open question: none
