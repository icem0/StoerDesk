# WP-M2-04b: Public report endpoint

format: small-model
status: planned
depends-on: WP-M2-04
phase: 2
context-budget: 22k tokens
spec: specs/06-report-form.md §7.2/§7.3/§7.5, PLAN.md §10 (report form), PLAN.md §7 rule 1
spec-lines: 95

files-read:

- specs/06-report-form.md (§7.3 request and responses, §7.3.3 idempotency, §7.3.4 time, §7.5 what one report writes)
- specs/02-data-model.md (§4.8 `tickets`, §4.8.1 clock difference, §4.9 events)
- apps/api/src/db/schema.ts (`tickets`, `ticketEvents`, `objects`, `systems` rows)
- apps/api/src/objects/qr.ts (token resolution, `generateQrToken()`, the `QrRouteError` envelope style)
- packages/shared/src/schemas/object.ts (`qrTokenSchema`, schema and naming style)
- apps/api/src/index.ts (plugin registration, error envelope, global rate limit)

files-write:

- packages/shared/src/schemas/ticket.ts
- packages/shared/src/schemas/index.ts
- apps/api/src/tickets/report.ts
- apps/api/src/index.ts

interfaces:

- `POST /api/v1/public/tickets` — no auth, `201` for a new report, `200` for an
  idempotent repeat, `400 invalid_request`, `404 qr_token_not_found`,
  `422 report_text_required` / `contact_required` / `system_not_found`
- `publicReportRequestSchema`, `publicReportResponseSchema`,
  `publicReportContactSchema` in `@stoerdesk/shared`
- `createPublicReport(database: Db, input: PublicReportRequest): Promise<{ report: PublicReport; replayed: boolean }>`
  — one transaction: `tickets` row (`status NEW`, `source QR`, `priority normal`)
  plus the append-only `created` event, `ticket_no` and `status_token` generated
  with the row

## Task

1. `packages/shared/src/schemas/ticket.ts`: `publicReportContactSchema`
   (`name`/`phone`/`email`, trimmed, at least one of phone or e-mail enforced in
   the service), `publicReportRequestSchema` per §7.3.1 (`qrToken`
   re-using `qrTokenSchema`, `clientUuid` as `z.uuid()`, optional trimmed `text`
   max 4000, `faultTemplateKeys` max 9 with `/^[a-z0-9_.]{1,64}$/`, optional
   `systemId` as `z.uuid()`, `contact`, optional `reportedAt` as
   `z.iso.datetime()`, `locale` default `de`), `publicReportResponseSchema`
   (`ticketId`, `ticketNo`, `status`, `statusToken`, `reportedAt`, `receivedAt`,
   `deadlineAt`, `clockSkewed`, `photoCount`) and the inferred types. Export the
   file from `packages/shared/src/schemas/index.ts`.
2. `apps/api/src/tickets/report.ts`: service per §7.5 — resolve the token to an
   **active** object (`404 qr_token_not_found`, also for a retired token: the form
   always submits the current token it got from §9.2), check `systemId` belongs to
   that object (`422 system_not_found`), enforce "text or template" and
   "phone or e-mail" (`422 report_text_required` / `contact_required`), apply the
   ±10 minute clock rule of §4.8.1 and `deadlineAt = base + 72 h`. Inside one
   transaction: `insert … .onConflictDoNothing({ target: tickets.clientUuid })`,
   and when nothing was inserted read the existing row and return it with
   `replayed: true` (that flag is service-internal and decides `200` vs `201`); otherwise insert the `created` event with
   `actorKind 'public'`, `actorUserId null` and
   `payload { locale, source, faultTemplateKeys, textLength }`. `ticket_no` comes
   from the column default `next_ticket_no()` (§4.11), `status_token` from
   `generateQrToken()` of `apps/api/src/objects/qr.ts` — the same 128-bit token
   generator, so no second token function exists.
3. Same file: `publicReportRoutes` (a `fastify-plugin`) registering
   `POST /api/v1/public/tickets` with no `preHandler`; Zod parse errors answer
   `400 invalid_request` with `{ fields }`, service errors reuse the existing
   global error envelope of `apps/api/src/index.ts`.
4. `apps/api/src/index.ts`: register the plugin after `objectRoutes`.
5. Test (fixture, outside the file budget):
   `apps/api/src/tickets/__tests__/report.integration.spec.ts` — happy path
   (`201`, `ST-<year>-NNNN` number, `NEW`, one `created` event, `status_token`
   set), idempotency (same `client_uuid` twice → one ticket, second call `200`
   with the same `ticketNo`), invalid token (`404`), missing text and templates
   (`422`), contact without phone/e-mail (`422`), foreign `systemId` (`422`),
   and a `reportedAt` 3 hours in the past (`clockSkewed`, deadline from
   `receivedAt`).

## Non-goals

- No photo storage and no `photos` field — WP-M2-04c.
- No rate limit per IP or token, no honeypot, no `suspected_spam` writer — WP-M2-07.
- No status page API `/api/v1/public/tickets/:token/status` and no UI — WP-M2-06,
  WP-M2-05. No duplicate hint — WP-M2-08.
- No office notification: `PLAN.md` §7 rule 1 runs through the outbox of phase 7;
  the `created` event is the hook it attaches to.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green with a reachable `TEST_DATABASE_URL`; the new spec fails
before the route exists and passes after it. No new i18n key: the API answers
error **codes**, never text.

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: `04c-report-photo-upload.md` (exists)
- Open question: none
