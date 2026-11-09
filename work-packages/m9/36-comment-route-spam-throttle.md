# WP-M9-36: public comment route throttle + status token (SEC-004, API side)

format: small-model
status: done
depends-on: WP-M9-35
phase: 9
milestone: m9
context-budget: 14k tokens
spec: PLAN.md §15 (audit — SEC-004); specs/06-report-form.md §7.6 (throttle)
spec-lines: 24

files-read:

- apps/api/src/tickets/duplicates.ts (route, addPublicComment)
- apps/api/src/tickets/spam.ts (recordReportAttempt, isReportSuspicious)
- apps/api/src/tickets/report.ts (report spam pattern for reference)
- packages/shared/src/schemas/ticket.ts (publicTicketCommentRequestSchema)
- apps/api/src/db/schema.ts (internalActionReceipts)

files-write:

- apps/api/src/tickets/duplicates.ts
- packages/shared/src/schemas/ticket.ts

interfaces:

- `publicTicketCommentRequestSchema` gains `clientUuid: z.uuid()` and `statusToken: qrTokenSchema`
  (both required).
- `addPublicComment` now checks the ticket's `statusToken`, uses `clientUuid` as a replay
  key against `internal_action_receipts` (WP-M5-03 pattern) and records the same report
  throttle; a suspicious flag marks the comment payload with `suspected_spam: true`.

## Task

1. `packages/shared/src/schemas/ticket.ts`: add `clientUuid` and `statusToken` to
   `publicTicketCommentRequestSchema`.
2. `apps/api/src/tickets/duplicates.ts`: import `internalActionReceipts` from the DB schema
   and `recordReportAttempt`/`isReportSuspicious` from `./spam`; in `addPublicComment`
   after the open-check compare `ticket.statusToken` against `input.statusToken`
   (null token or mismatch → `403 comment_status_token_mismatch`), look up an existing
   `internalActionReceipts` row by `clientUuid` and short-circuit with the stored
   `event.createdAt`, otherwise record the report attempt, run the suspicious check and
   write `suspected_spam: true` into the event payload if flagged, then transaction:
   insert `ticketEvents` (public comment) and insert the receipt. Pass `{ ip: request.ip }`
   from the route handler.

## Non-goals

- No web-side honeypot / Altcha proof-of-work UI (that is WP-M9-37).
- No new i18n key (the payload is machine-readable, not translated).
- No DB migration; `internalActionReceipts` already exists (WP-M5-03).

## Acceptance

```bash
npm run check
```

Expected: green — comment tests already send the new `statusToken` value from the report
flow; the existing integration spec grows its fixture accordingly (tests are excluded from
the source-file limit).

## Handoff

- Files changed: the two above
- Interfaces added: `addPublicComment` now takes a `context: { ip: string }` third argument
- Verified: `npm run check`
- Follow-up WP: WP-M9-37 (public comment web flow: honeypot + Altcha, SEC-004 web side)
- Open question: none
