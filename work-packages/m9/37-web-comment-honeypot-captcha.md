# WP-M9-37: public comment web flow honours the spam contract (SEC-004, web side)

format: small-model
status: done
depends-on: WP-M9-36
phase: 9
milestone: m9
context-budget: 10k tokens
spec: PLAN.md §15 (audit — SEC-004, web side); specs/06-report-form.md §7.6 (throttle)
spec-lines: 20

files-read:

- apps/web/src/features/tickets/report-form-page.tsx (comment POST, handledErrorCodes, honeypot/verification state)
- apps/api/src/tickets/duplicates.ts (addPublicComment signature after WP-M9-36)

files-write:

- apps/web/src/features/tickets/report-form-page.tsx

interfaces:

- The comment POST body now mirrors the report contract: `clientUuid`, `website`,
  `verification` and `statusToken` (the reporter's own `report.statusToken` when
  this browser already created a report; otherwise the scanned `qrToken` as a
  placeholder, so a foreign comment yields `403 comment_status_token_mismatch`).
- `handledErrorCodes` gains `comment_status_token_mismatch`.

## Task

1. Extend the comment POST body in `addToExisting()` to carry `clientUuid`,
   `website`, `verification`, and `statusToken` (from `report?.statusToken`
   or the scanned `qrToken`).
2. Add `'comment_status_token_mismatch'` to `handledErrorCodes` so the form
   shows the API's notice instead of an unhandled error page.
3. Update the module header comment to name the new WP.

## Non-goals

- No new captcha retry loop for comments (the report flow is unchanged).
- No UI redesign; the duplicate hint button stays where it is.
- No change to `apps/api/src/tickets/duplicates.ts` (already hardened in WP-M9-36).

## Acceptance

```bash
npm run check
```

## Handoff

- Files changed: `apps/web/src/features/tickets/report-form-page.tsx`
- Interfaces added: none
- Verified: `npm run check`
- Follow-up WP: WP-M9-38 (BMAcloud credentials guard, SEC-009)
- Open question: none
