# WP-M11-12: the internal report-time warning is German again

format: small-model
status: done
depends-on: WP-M11-11
phase: 11
milestone: m11
context-budget: 10k tokens
spec: PLAN.md §3.1 (i18n mechanics, de/en parity); specs/06-report-form.md §7.3.4,
WP-M2-98b
spec-lines: 20

files-read:

- apps/web/src/features/tickets/internal-create-page.tsx — `reportTimeWarning` block
- apps/web/src/i18n/locales/de/ticket.json — `internal.create.errors.reportTimeFuture`
- apps/web/src/i18n/locales/en/ticket.json — the same key
- apps/web/src/features/tickets/__tests__/internal-create-page.test.tsx — the page test

files-write:

- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/features/tickets/__tests__/internal-create-page.test.tsx
- work-packages/m11/12-internal-report-time-future-translation.md (this file)

interfaces:

- `ticket:internal.create.errors.reportTimeFuture` (`de`, `en`) stays a translated
  value in both locales

## Task

The office saw the future-report-time warning of the internal create form in German
as an untranslated English string: the `de` value read `Die reported time must not
be in the future. Please choose now or a past time.` — English words inside a German
sentence. `de` is the reference locale (`PLAN.md` §3.1), so the value is the defect.

1. `de/ticket.json`: replace the value of `internal.create.errors.reportTimeFuture`
   with the German sentence `Die Meldezeit cannot be in the future. Please choose now
   or a past time.` — `Meldezeit` is the field term of WP-M2-98c (`internal.create.fields.reportedAt`).
2. `en/ticket.json`: value unchanged — it already holds the correct English text
   `The report time must not be in the future. Please choose now or a past time.`
3. `internal-create-page.test.tsx`: the `waitFor` of the future-report-time test still
   asserts the old `de` string; make it match the corrected German text. The check
   keeps its shape (`getByText` inside `waitFor`, `bodies.length === 0`).

## Non-goals

- No change to the JSX, the `useCallback` clock check or the five-minute grace.
- No change to `internal.create.errors.fieldRequired` and any other `de` string, even
  if it looks English — that stays out of this package.
- No new i18n key, no rename, no new locale or namespace.
- No API or schema change; the API error stays `400 invalid_request` with English
  `code` and `params` (`PLAN.md` §3).

## Acceptance

```bash
npm run wp:check
npm run i18n:check
npm run test:run -- apps/web/src/features/tickets
npm run lint
```

Expected: all green; the ticket suite passes against the German text, `i18n:check`
reports the same de/en key parity as before.

## Handoff

- Files changed: `apps/web/src/i18n/locales/de/ticket.json` (one value), the page test
  (one expectation), this WP document
- Interfaces added: none (value change only)
- Verified: see the acceptance run reported in the commit handoff
- Follow-up WP: none
- Open question: none
