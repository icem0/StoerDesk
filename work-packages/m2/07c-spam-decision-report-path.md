# WP-M2-07c: Spam decision on the report create path

format: small-model
status: implemented
depends-on: WP-M2-07b
phase: 2
context-budget: 22k tokens
spec: specs/06-report-form.md §7.3.2 (error codes), §7.6 (rate limit and spam, `suspected_spam`), PLAN.md §10 (spam bullet: honeypot, rate limit, Altcha only when suspicious, suspicious still stored), §16 phase 2 exit criterion
spec-lines: 30

files-read:

- apps/api/src/tickets/spam.ts (WP-M2-07: `isReportSuspicious`, `recordReportAttempt`)
- apps/api/src/tickets/altcha.ts (WP-M2-07b: `verifyAltchaPayload`)
- apps/api/src/tickets/report.ts (the create path this package gates)
- apps/api/src/config/env.ts (empty `ALTCHA_SECRET` means "no captcha configured")
- apps/api/src/db/schema.ts (`tickets.suspectedSpam`)
- packages/shared/src/schemas/ticket.ts (`publicReportRequestSchema`, `altchaVerificationSchema`)

files-write:

- apps/api/src/tickets/report.ts
- packages/shared/src/schemas/ticket.ts
- apps/api/src/tickets/**tests**/report.integration.spec.ts (fixture, excluded)

interfaces:

- request `publicReportRequestSchema` gains `website` (honeypot, optional `string`;
  absent or empty means human) and `verification` (optional, validated by a new shared
  `altchaVerificationSchema` — `{ algorithm: 'SHA-256', challenge, salt, signature,
  number: int, maxnumber?: int, took?: int, key?: string }` — added in
  `packages/shared/src/schemas/ticket.ts`)
- `createPublicReport(database, input, storage, context)` — new 4th arg
  `context: { ip: string; altchaSecret: string }`; route passes `request.ip` and
  `ALTCHA_SECRET`
- new error `400 captcha_required` (`params.fields = ['verification']`) for a
  suspicious report without a valid proof of work
- the stored `tickets.suspected_spam` reflects the decision below; `PublicReport`
  response is unchanged

Decision (§7.6 / `PLAN.md` §10, resolved in this order after the existing
`report_text_required` / `contact_required` / `system_not_found` checks):

1. record this attempt (`recordReportAttempt`) and compute
   `suspicious = isReportSuspicious(db, { ip, qrToken })`.
2. honeypot filled (`website !== ''`) → store the ticket with
   `suspected_spam = true`; never call Altcha; never drop it.
3. else if `suspicious`: require `verification`. Missing or
   `verifyAltchaPayload(...) === false` → `400 captcha_required` (no ticket). Valid
   → store with `suspected_spam = false`.
4. else store with `suspected_spam = false`.
5. if `ALTCHA_SECRET` is unset, a suspicious report is stored with
   `suspected_spam = true` instead of answering `400` (no captcha configured must
   never lose a report).

## Task

WP-M2-07 detects suspicion and WP-M2-07b can verify a solved challenge; this
package puts both, plus the honeypot, onto the single create path so a suspicious
or honeypot report is still stored and flagged, and a suspicious report without a
valid proof of work is rejected without losing the earlier attempts.

1. `packages/shared/src/schemas/ticket.ts`: export `altchaVerificationSchema` (and its
   type) plus add `website` (honeypot, default `''`) and optional `verification`
   (reuses `altchaVerificationSchema`) to `publicReportRequestSchema`.
2. `apps/api/src/tickets/report.ts`: thread `context.ip` and `context.altchaSecret`
   into `createPublicReport`; after validation call `recordReportAttempt` +
   `isReportSuspicious`; apply the decision above; set `suspectedSpam` in
   `insertValues`; add the `400 captcha_required` error.
3. Route handler: pass `{ ip: request.ip, altchaSecret: ALTCHA_SECRET }` (honours
   `TRUST_PROXY`).
4. Extend the fixture: honeypot filled → `201` with `suspected_spam = true`; a 4th
   report from one IP/token inside 10 min without `verification` → `400
   captcha_required`; the same with a valid proof of work → `201`,
   `suspected_spam = false`; and a plain first report → `201`, not flagged.

## Non-goals

- No UI, no challenge fetch, no widget — **WP-M2-07d**.
- No new response field; the client detects the captcha need through
  `400 captcha_required`.
- No duplicate hint (`parent_ticket_id`, WP-M2-08), no offline replay.
- No retention rule for `report_throttle` (open question in WP-M2-07).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npx vitest run src/tickets/__tests__/report.integration.spec.ts
npm run wp:check
```

Expected: all green; the four new integration assertions pass against
`TEST_DATABASE_URL` and are skipped without a reachable database.

## Handoff

- Files changed: `apps/api/src/tickets/report.ts`,
  `packages/shared/src/schemas/ticket.ts`, the fixture
  `apps/api/src/tickets/__tests__/report.integration.spec.ts` and the bookkeeping
- Interfaces added: honeypot `website` + optional `verification` on the request,
  `400 captcha_required`, the `suspected_spam` decision on the create path
- Verified: `npm run check` green — typecheck (3 workspaces), `eslint .` (0 errors,
  the one pre-existing `photo-upload.tsx` fast-refresh warning), `vitest run` 39 files /
  222 tests against the reachable PostgreSQL of `TEST_DATABASE_URL` (not skipped),
  `i18n:check`, `wp:check` and `npm run test:e2e` green with
  `E2E_CHROMIUM_PATH=/usr/bin/chromium` (4 Playwright tests); `npm run build` green
- Follow-up WP: consumed by `07d-spam-form-ui.md` (created with the WP-M2-07
  rewrite); no new follow-up announced here
- Open question: none (inherits the `report_throttle.ip` retention question from
  WP-M2-07)
