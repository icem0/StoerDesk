# WP-M2-98b: internal create accepts report time, channel and reporter kind

format: small-model
status: implemented
depends-on: WP-M2-98
phase: 2
context-budget: 24k tokens
spec: specs/06-report-form.md §7.3.4, PLAN.md §7 rule 1, PLAN.md §10
spec-lines: 70

files-read:

- packages/shared/src/schemas/ticket.ts — internal create request/response
- apps/api/src/tickets/internal.ts — `createInternalTicket` and routes
- apps/api/src/db/schema.ts — reporter columns of WP-M2-98
- apps/api/src/admin/users.ts — active user shape and ordering
- apps/api/src/tickets/__tests__/internal-title.integration.spec.ts — test setup
- apps/api/src/tickets/deadline.ts — deadline helper

files-write:

- packages/shared/src/schemas/ticket.ts — request fields and reporter-user list
- apps/api/src/tickets/internal.ts — service rules and `GET /tickets/reporter-users`
- apps/api/src/tickets/__tests__/internal-report-metadata.integration.spec.ts — tests

interfaces:

- `internalCreateTicketRequestSchema` gains `reportedAt`, `reporterChannel`,
  `reporterKind`, `reportedByUserId`
- `GET /api/v1/tickets/reporter-users` (guard `ticket.create`) answers
  `{ users: [{ id, name, email }] }` for active users
- service: `reportedAt` defaults to now, may not lie in the future (5 min grace),
  `received_at` stays server now, `deadline_at` starts at `reportedAt`
- `reporterKind = 'internal'` requires an active `reportedByUserId`; name and
  e-mail are then filled from that user when the body leaves them empty

## Task

1. Shared schema: add `reportedAt` (`z.iso.datetime({ offset: true, local: true })`),
   `reporterChannel` (`phone|email|messenger`, optional), `reporterKind`
   (`internal|external`, optional), `reportedByUserId` (uuid, optional) and export
   `reporterUserListResponseSchema`.
2. `createInternalTicket`: compute `receivedAt = new Date()`, reject a
   `reportedAt` later than `receivedAt + 5 min` with `400 invalid_request`
   (`fields: ['reportedAt']`), use `input.reportedAt ?? receivedAt` as
   `reportedAt`, and compute the deadline from that value. Store channel, kind
   and user id.
3. Internal kind: load the user by id with `active = true`, answer
   `422 reporter_user_not_found` otherwise, and derive `reporterName` /
   `reporterEmail` from the user when the contact does not carry them. External
   kind stores `reported_by_user_id = NULL`.
4. Include `reporterChannel`, `reporterKind` and `reportedByUserId` in the
   `created` event payload.
5. Add `GET /api/v1/tickets/reporter-users` to `internalTicketRoutes`, guarded by
   `PERMISSIONS.ticket.create`, returning active users ordered by family/given
   name. Keep the answer free of password hashes and roles.
6. Integration test: backdated report keeps `reportedAt`, has `receivedAt ≈ now`,
   deadline = `reportedAt + priority hours`; future timestamp is `400`; internal
   kind without a user is `422`; active internal user fills name and e-mail.

## Non-goals

- No UI (WP-M2-98c), no timeline (WP-M2-98d), no history (WP-M2-98e).
- The public QR path and the external API keep their current clock rules.
- No new permission key and no clock-skew flag for intentional backdating.

## Acceptance

```bash
npm run wp:check
npm run check
```

Expected: all green; the integration test runs with a reachable database and is
reported unverified when it skips.

## Handoff

- Files changed: shared ticket schema, `internal.ts`, new integration test
- Interfaces added: the four request fields and the reporter-user list route
- Verified: `npm run wp:check`, `npm run check`
- Follow-up WP: WP-M2-98c, WP-M2-98d, WP-M2-98e
- Open question: none
