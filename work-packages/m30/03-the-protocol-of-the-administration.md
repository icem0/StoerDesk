# WP-M30-03: the protocol of the administration

format: ctx-256k
status: done
depends-on: WP-M30-02
phase: 30
milestone: m30
context-budget: 52k tokens
spec: specs/10-notifications.md §11.8, §11.11, §11.12, §11.16
spec-lines: 110
changed-lines: 497

files-read:

- specs/10-notifications.md §11.8 (the problems of the channels), §11.16 (the protocol)
- apps/api/src/notifications/messages.ts (the reading of the messages — the protocol of today)
- apps/api/src/notifications/delivery.ts (the problems and their quittature)
- apps/api/src/notifications/routes.ts (the routes of the administration)
- apps/web/src/admin/delivery-page.tsx (the page of the delivery — the model of the block)
- packages/shared/src/schemas/notification.ts (the contracts)

files-write:

- apps/api/src/notifications/messages.ts
- apps/api/src/notifications/routes.ts
- packages/shared/src/schemas/notification.ts
- apps/web/src/admin/delivery-page.tsx
- apps/web/src/i18n/locales/de/settings.json, apps/web/src/i18n/locales/en/settings.json
- apps/api/src/notifications/__tests__/deliveries-routes.integration.spec.ts
- docs/DECISIONS/0052-the-task-and-the-protocol.md, specs/10-notifications.md, PLAN.md §14
- docs/REPO-MAP.md, CHANGELOG.md
- work-packages/m30/03-the-protocol-of-the-administration.md, work-packages/m30/01-the-message-is-a-task-and-the-protocol.md

interfaces:

- `readDeliveries(database, scope)` — the delivery attempts with their recipient, their channel, their state and their machine code
- `GET /api/v1/admin/notifications/attempts` — the protocol of the delivery (`notification.read_all`)
- the block „the attempts of the delivery“ on the page `/admin/delivery`

## Task

The office asks for **one** page of the delivery, not two: „what went wrong“
and „who got what“ are one question with two answers. The page `/admin/delivery`
carries the problems of the channels since phase 14 (§11.8) — it gains the
**protocol** beside them (ADR-0052 decision 3): every delivery attempt of the
instance with its recipient, its event, its channel, its state, the machine code
of a failure, the time and the number of the attempts.

1. **The reading** `apps/api/src/notifications/messages.ts`: `readDeliveries`
   answers the rows of `notification_messages` — one row per **delivery
   attempt** — with the recipient (the name of the user, else the e-mail), the
   event type, the channel, the state, the subject of the message (the ticket
   number or the pool), the machine code of the failure and the number of the
   attempts of the row of the outbox, and the time of the attempt. The filters
   of §11.16 narrow the answer: the recipient, the channel, the event and the
   state. The list of the recipients answers with the number of their attempts;
   the filter of the recipient is not applied to that list, so it stays
   complete while the filter is active.
2. **The route** `apps/api/src/notifications/routes.ts`:
   `GET /api/v1/admin/notifications/attempts` behind `notification.read_all`
   — the protocol names the users, so the route answers `403 forbidden`
   without the right. An unknown value of a filter answers
   `400 invalid_request` with the field path.
3. **The contracts** `packages/shared/src/schemas/notification.ts`: the schema
   of an attempt, the answer of the list and the filter.
4. **The page** `apps/web/src/admin/delivery-page.tsx`: below the problems the
   block „the attempts of the delivery“ — the table with the columns (the
   recipient, the event, the channel, the state, the machine code, the time and
   the attempts) and the filters of §11.16 above the table. The block appears
   only with the right `notification.read_all`; without it the page shows the
   problems as before. The texts of the reasons of a failure stay in the
   namespace of the page — the two blocks name the same codes with the same
   sentences.
5. **The texts** in `de/settings.json` and `en/settings.json`: the heading of
   the block, the columns, the filters and the empty answer.
6. **The tests**: the test of the route proves the refusal without the right,
   the filters and the answer; the test of the page proves that the block
   appears with the right and that a row names the recipient.

## Non-goals

- No page of its own — the protocol lives on `/admin/delivery` (ADR-0052
  decision 3).
- No change of the problems of the channels and of their quittature (§11.8).
- No change of the inbox — the tasks reach the page in WP-M30-04.
- No new permission — the protocol is guarded by `notification.read_all`.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the test of the route proves the filters and the refusal
without the right.

## Handoff

- Files changed: the reading, the route, the contracts, the page of the
  delivery, the two locales, the test of the route, the ADR (the page of the
  protocol), the spec, the plan and the module map
- Interfaces added: `readDeliveries`, the route
  `GET /api/v1/admin/notifications/attempts` and the block of the protocol on
  the page of the delivery
- Verified: `npm run check` green (wp:check 823/0, eslint 0 errors, vitest 285 files / 2014 tests, Playwright 15/15); the test of the route proves the refusal without `notification.read_all`, the answer with the recipient, the channel and the state, the filters and the refusal of an unknown value; the test of the page proves the block beside the problems and its absence without the right
- Follow-up WP: WP-M30-04 — the inbox shows the tasks
- Open question: none
