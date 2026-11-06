# WP-M8-14: my on-call shifts page

format: small-model
status: planned
depends-on: WP-M8-07, WP-M8-09, WP-M8-12
phase: 8
milestone: m8
context-budget: 22k tokens
spec: specs/04-oncall.md §4a.4, §4a.5, §4a.7
spec-lines: 90

files-read:

- specs/04-oncall.md (§4a.4 confirm/decline, §4a.5 swaps, §4a.7 iCal)
- apps/web/src/features/tickets/ticket-detail-page.tsx (action panel pattern)
- apps/web/src/routes/index.tsx (route registration)
- apps/web/src/components/Shell.tsx (settings menu)
- apps/web/src/auth/use-permission.tsx (permission gating)
- apps/web/src/i18n/locales/de/oncall.json (namespace shape)

files-write:

- apps/web/src/features/oncall/my-shifts-page.tsx
- apps/web/src/routes/index.tsx
- apps/web/src/components/Shell.tsx
- apps/web/src/i18n/locales/{de,en}/oncall.json

interfaces:

- `MyShiftsPage` at `/oncall`, guarded by `RequireSession`
- shift cards with state, pool, local start/end, confirm and decline
- decline form with a mandatory reason (5–500 characters)
- swap request form with "one colleague" and "whole pool"
- copyable iCal URL and a subscribe hint

## Task

1. Build `MyShiftsPage` from `GET /api/v1/oncall/shifts` filtered to the signed-in
   user; group by upcoming and past shifts, show local `Europe/Berlin` times and
   the state label from the `oncall` namespace.
2. Confirm `PLANNED` shifts through `POST /shifts/:id/confirm`; decline with the
   reason form through `/decline`. Show the field and API errors inline.
3. Request a swap on `CONFIRMED` shifts: choose a colleague from the pool or
   "whole pool", then `POST /shifts/:id/swap`. Show the open request on the card
   and allow the requester to cancel it.
4. Show the personal iCal URL from `icalTokenFor` (exposed by a small read route
   or computed by the page through the existing session data) with a copy
   button and the subscribe hint; never log the token.
5. Register the route and the menu entry, and add every new label to the `de`
   and `en` `oncall` namespace.

## Non-goals

- No offline queue (WP-M8-15).
- No admin actions; the admin page is WP-M8-13.
- No push notification or reminder.
- No swap acceptance; that stays online-only on the pool view.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run build
npm run wp:check
```

Expected: all green; `/oncall` renders for an on-call user and hides actions for
roles without `oncall.confirm`/`oncall.swap`.

## Handoff

- Files changed: the my-shifts page, the route table, the shell menu, both
  on-call locale files
- Interfaces added: `/oncall` and the technician actions above
- Verified: typecheck, lint, test:run, i18n:check, build
- Follow-up WP: WP-M8-15 (offline confirm/decline)
- Open question: the iCal URL route for the page may be a small authenticated
  helper route; if added, it shares `icalTokenFor` and is not public.
