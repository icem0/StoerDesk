# WP-M5-04: idempotency on the action routes and the internal comment route (api)

format: small-model
status: done
depends-on: WP-M5-03
phase: 5
milestone: m5
context-budget: 18k tokens
spec: PLAN.md §10 (offline writes replay), PLAN.md §7 (workflow), specs/09-offline.md §9.6
spec-lines: 40

files-read:

- apps/api/src/tickets/workflow-routes.ts — the route table, guards and Zod bodies
- apps/api/src/tickets/internal-actions.ts — `applyInternalAction` (WP-M5-03)
- apps/api/src/tickets/internal.ts — the internal ticket routes and guard style
- packages/shared/src/permissions.ts — `ticket.comment`, `ticket.acknowledge`, `ticket.accept`

files-write:

- apps/api/src/tickets/workflow-routes.ts — `clientUuid` on acknowledge/decline, via the helper
- apps/api/src/tickets/internal.ts — `POST /api/v1/tickets/:ticketNo/comments`
- apps/api/src/tickets/__tests__/internalActions.routes.integration.spec.ts — route tests
- specs/09-offline.md — §9.6 line moves the internal writes into the shipped scope

interfaces:

- the acknowledge and decline bodies gain `clientUuid: z.string().uuid().optional()`;
  when present the route runs `applyInternalAction` instead of calling
  `transitionTicket` directly: first delivery `200` with the new ticket,
  replay `200` with `{ …, replayed: true }` and no second event
- `POST /api/v1/tickets/:ticketNo/comments` — `ticket.comment` permission,
  body `{ clientUuid: uuid, text: string (1…2000) }`, appends one
  `ticket_events` row `type: 'comment'`, `actorKind: 'user'` and answers `201`;
  a replay of the same `clientUuid` answers `200` with the stored comment
- conflicts keep the contract of `PLAN.md` §3: `409 invalid_transition` with
  `{ ticketNo, from, event }` in `params` — `from` is the current server status

## Task

1. Add the optional `clientUuid` to the acknowledge and decline Zod schemas and
   route both through `applyInternalAction`; without `clientUuid` keep today's
   direct `transitionTicket` call so online clients are unaffected.
2. Add the internal comment route in `internal.ts` with the interface above; the
   text is one append-only event, never a column (same rule as the public
   comment of `duplicates.ts`).
3. Route tests: acknowledge with `clientUuid` twice → one `acknowledged` event;
   comment twice → one `comment` event; decline on a `NEW` ticket → `409` with
   `from: 'NEW'`; replay keeps `ticket_events` unchanged.
4. Update `specs/09-offline.md` §9.6: the three internal writes and their
   receipts are shipped; confirm/decline a shift stays out (phase 8).

## Non-goals

- No web UI and no outbox delivery change — WP-M5-06/07.
- No service-worker offline reads — WP-M5-08.
- No new permission keys; `ticket.comment` exists and stays admin/dispatch-only.

## Acceptance

```bash
npm run typecheck -w @stoerdesk/api
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the route spec runs in CI on the throwaway database and
skips locally without PostgreSQL (reported as unverified locally).

## Handoff

- Files changed: `apps/api/src/tickets/workflow-routes.ts` (acknowledge/decline bodies gain optional `clientUuid`; both routes delegate to `applyInternalAction` when present, otherwise keep the direct `transitionTicket` call), `apps/api/src/tickets/internal.ts` (new `POST /api/v1/tickets/:ticketNo/comments` guarded by `ticket.comment`, body `{ clientUuid: uuid, text: string (1…2000) }`, answers `201` on first delivery, `200` with `{ replayed: true }` on replay), `apps/api/src/tickets/__tests__/internalActions.routes.integration.spec.ts` (new), `docs/REPO-MAP.md` (internal.ts + workflow-routes.ts rows), `work-packages/README.md` (WP-M5-04 status → done), `specs/09-offline.md` (§9.6: acknowledge/comment/decline shipped via phase 5, confirm/decline shift stays phase 8)
- Interfaces added: acknowledge/decline bodies accept optional `clientUuid: z.string().uuid()`; `POST /api/v1/tickets/:ticketNo/comments` with `{ clientUuid, text }` → `201` / replay `200` with `{ replayed: true }`; conflicts keep `409 invalid_transition` with `{ ticketNo, from, event }` in `params`
- Verified: `npm run typecheck --workspaces`, `eslint` on the changed files (0 errors), `vitest run` on both new specs (5 + 5 tests pass against real Postgres 16), `npm run wp:check` (179 checked, 0 failed), `npm run i18n:check` (584/584 keys). The three pre-existing failures of `internalActionReceipts.integration.spec.ts` (fake `objectId` FK) fail identically without this change.
- Follow-up WP: WP-M5-05 (`m5/05-offline-action-queue-ui.md`)
- Open question: none
