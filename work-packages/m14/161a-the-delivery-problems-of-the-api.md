# WP-M14-161a: the delivery problems of the API and their quittature

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 26k tokens
spec: specs/10-notifications.md §11.8, §11.11
spec-lines: 60

depends-on: WP-M14-154b

files-read:

- specs/10-notifications.md (§11.8 the status, §11.11 the API)
- apps/api/src/notifications/routes.ts (the status route of §11.8)
- apps/api/src/notifications/outbox.ts (the rows of the outbox, `lastError`)
- apps/api/src/db/schema.ts (the tables `outbox` and `settings`)
- apps/api/src/settings/notifications.ts (the settings row of §11.9)
- packages/shared/src/schemas/notification.ts (the contracts of the channels)

files-write:

- specs/10-notifications.md (§11.8 the quittature, §11.11 the two routes)
- packages/shared/src/schemas/notification.ts (the delivery contracts)
- apps/api/src/notifications/delivery.ts, apps/api/src/notifications/routes.ts
- apps/api/src/notifications/__tests__/delivery.integration.spec.ts,
  docs/REPO-MAP.md, PLAN.md §16, CHANGELOG.md, work-packages/README.md, this document

interfaces:

- `deliveryProblemsResponseSchema` — `{ problems, failures }` of the delivery
- `deliveryProblemSchema`, `deliveryFailureSchema` — one problem, one lost message
- `acknowledgeDeliveryRequestSchema`, `acknowledgeDeliveryResponseSchema` — the quittature
- `readDeliveryProblems(database)` — the problems and the lost messages
- `acknowledgeDeliveryProblems(database, channels, userId)` — the quittature of the problems
- `GET /api/v1/notifications/delivery` — `notification.read`
- `POST /api/v1/notifications/delivery/acknowledge` — `notification.write`

## Task

**The office asked (out of band in phase 14):** the badge „Zustellung gestört (1)“
in the settings menu must be a **link** to a page where an admin sees the
problem and can **quit** it — and when the problem is solved and the next
reports arrive, the message must be quittable again.

1. `specs/10-notifications.md` §11.8 gains the rule: a failed delivery is a
   problem until somebody acknowledges it; the acknowledgement stores the
   **time** (the settings row `notifications.delivery_acknowledged`, one entry
   per channel) and every failure after that time opens the problem again.
   §11.11 gains the two routes, §11.12 the page `/admin/delivery`.
2. `packages/shared/src/schemas/notification.ts` gains the contracts:
   `deliveryProblemSchema` (the channel, the failed and the unacknowledged
   deliveries, the times, the machine code, the acknowledgement, `open`),
   `deliveryFailureSchema` (one lost message), the two answers and the request
   of the quittature.
3. `apps/api/src/notifications/delivery.ts` reads the problems: per channel the
   failed rows of the outbox, the failures after the acknowledgement, the
   times of the last failure and the last success, the machine code of the
   last failure and the name of the user that acknowledged. The times are the
   times of the **failure** (`updated_at`), not the times of the queueing.
   The acknowledgement is written back into the settings row; the entries of
   the other channels stay untouched.
4. `apps/api/src/notifications/routes.ts` answers `GET
   /api/v1/notifications/delivery` behind `notification.read` and `POST
   /api/v1/notifications/delivery/acknowledge` behind `notification.write`. The
   body names the channels; a missing or empty list acknowledges every open
   problem. A malformed body answers `400 invalid_request` with the field
   paths.

## Non-goals

- No change of the status route `/api/v1/notifications/status` and no change
  of the tile of the dashboard: the tile stays the raw state of the outbox.
- No new table and no migration: the acknowledgement lives in the `settings`
  row of the instance.
- No deletion of a failed row and no retry of a lost message.
- No change of the adapters, of the drain worker and of the escalation chain.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new integration test proves the problem, the
quittature, the name of the user and the failure that opens the problem again.

## Handoff

- Files changed: the contract of the delivery, the service `delivery.ts`, the
  two routes, the spec §11.8/§11.11/§11.12 and the repository docs
- Interfaces added: the five schemas of the delivery, `readDeliveryProblems`,
  `acknowledgeDeliveryProblems` and the two routes
- Verified: `npm run typecheck --workspaces --if-present`, `npm run lint`,
  `npm run test:run`, `npm run i18n:check`, `npm run wp:check`
- Follow-up WP: WP-M14-161b (the page `/admin/delivery`), WP-M14-161c (the
  badge of the settings menu becomes the link)
- Open question: none
