# WP-M2-05c: Report form smoke E2E in de and en

format: small-model
status: planned
depends-on: WP-M2-05b
phase: 2
context-budget: 22k tokens
spec: specs/06-report-form.md §7.1–§7.4, specs/16-acceptance.md §18.1 #1 (QR report path), PLAN.md §16 phase 2 exit criterion, §14 (mobile-first)
spec-lines: 90

files-read:

- apps/web/e2e/auth.spec.ts (the existing E2E conventions: language via `localStorage`,
  admin credentials from `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD`, spelled-out de/en texts)
- apps/web/playwright.config.ts (webServer pair, E2E ports, `E2E_CHROMIUM_PATH`)
- apps/web/src/features/tickets/report-form-page.tsx (the control names to drive)
- packages/shared/src/schemas/object.ts and ticket.ts (`CreateObjectRequest`, `PublicReport`)
- specs/06-report-form.md (§7.2 fields, §7.3.2 responses)

files-write:

- apps/web/e2e/report-form.spec.ts

interfaces:

- two Playwright tests — `report a malfunction through the QR form (DE)` and `(EN)` —
  on a 375×667 viewport (PLAN §14 mobile-first)
- the object under test is created **through the running stack**: the signed-in browser
  context calls `POST /api/v1/objects` and the response's `qrToken` becomes the URL
  `/m/<token>`; no fixture token and no write into the throwaway database
- expectations come from the rendered locale, never from the JSON files (the rule of
  `auth.spec.ts`)

## Task

1. Sign in as the seeded administrator (same two-line credential block as
   `auth.spec.ts`), then `POST /api/v1/objects` with `objectNo: 'E2E_M2_05'`, a known
   name and one `BMA` system through `page.context().request`; the response carries the
   generated `qrToken` (WP-M2-02).
2. `page.goto('/m/<token>')` with `test.use({ viewport: { width: 375, height: 667} })`;
   assert the object header (name and number), the 112 notice and the prefilled single
   system select.
3. Fill the form: tap one fault chip, write the free text, fill the phone field, and in
   one of the two runs attach a photo through `setInputFiles` with an in-memory 1×1 JPEG
   buffer — that is the proof that the canvas compression of WP-M2-05b really runs in a
   browser and that the server accepts the bytes (WP-M2-04c magic-byte check).
4. Submit and expect the confirmation: the ticket number matching
   `ST-<year>-\d{4}`, the status link whose `href` ends in `/s/<22 chars>` and, in the
   photo run, the photo count of the answer.
5. Repeat the same flow in the other locale and assert the English labels of the same
   controls, so both locale bundles are proven on the public page.

## Non-goals

- No full QR scan, pool, review and close workflow — that is the phase 2 closing package
  **WP-M2-10**; this package proves only the public form.
- No offline replay through the Dexie outbox (WP-M2-09), no spam/honeypot assertions
  (WP-M2-07), no status page assertions (WP-M2-06) — the link is only asserted to exist.
- No new Playwright project or device descriptor: the viewport is set inside the spec, so
  `playwright.config.ts` and `scripts/e2e-check.mjs` stay untouched.

## Acceptance

```bash
npm run test:e2e
npm run check
```

Expected: two new green tests in the `chromium` project against the throwaway E2E
database; `npm run check` stays green (locally a missing browser or database stays a
notice, in CI both are required).

## Handoff

- Files changed: `apps/web/e2e/report-form.spec.ts` (new) plus the module row and status
  lines in `docs/REPO-MAP.md` and `work-packages/README.md`
- Interfaces added: 2 Playwright tests, no runtime API
- Verified: see the handoff of the implementation commit
- Follow-up WP: none — the phase 2 exit-criterion E2E is the existing WP-M2-10
- Open question: none
