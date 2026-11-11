# WP-M2-99: the branding title switch saves itself

format: small-model
status: implemented
depends-on: WP-M2-90b, WP-M9-25
phase: 2
milestone: m2
context-budget: 14k tokens
spec: PLAN.md §14 (settings: branding), PLAN.md §3.1 (i18n mechanics);
specs/02-data-model.md §4.x `tickets.title`
spec-lines: 20

files-read:

- apps/web/src/settings/branding-page.tsx — title checkbox and shared save button (WP-M2-90b, WP-M4-09)
- packages/shared/src/schemas/settings.ts — `BrandingResponse`, `UpdateBrandingRequest` (WP-M2-89)
- apps/web/src/settings/**tests**/branding-page.test.tsx — the page test
- apps/web/src/i18n/locales/de/common.json — the `branding.*` keys
- apps/web/src/i18n/locales/en/common.json — the same keys in English

files-write:

- apps/web/src/settings/branding-page.tsx — the title checkbox saves immediately
- apps/web/src/settings/**tests**/branding-page.test.tsx — immediate-save test
- apps/web/src/i18n/locales/de/common.json — `branding.hintTitleEnabled` says so
- apps/web/src/i18n/locales/en/common.json — same key, English text

interfaces:

- `BrandingPage` — a click on the `titleEnabled` checkbox immediately `PUT`s
  `{ companyName: <stored>, titleEnabled: <clicked>, logo: <stored> }` and shows
  the `branding.saved` line; the shared save button stays for name and logo
- `common:branding.hintTitleEnabled` — de/en state that a click saves immediately

## Task

The office complained that the menu entry "Titel bei Ticket erfassen" has no
confirmation key: toggling the checkbox looks free-standing, and the only
`Speichern` button sits at the very end of the form under the logo preview.
The office wants the switch to become effective right here, default off.

1. In `branding-page.tsx` the checkbox of `titleEnabled` fires its own save:
   the `onChange` handler reads `event.target.checked`, stores it in the page
   state and — while the user may write and no other save is pending — calls
   `mutation.mutate` with the **stored** company name and logo and the clicked
   title value. The save is skipped while the clicked value already equals
   `branding.data.titleEnabled`, so a re-render that re-syncs the checkbox
   never re-`PUT`s.
2. `onSuccess` keeps the checkbox on the value the server answered
   (`result.titleEnabled`) instead of resetting it to `null`, so an immediate
   save never flips the checkbox back while the query revalidates.
3. Update `branding.hintTitleEnabled` in `de` and `en`: the hint now states that
   clicking the checkbox saves the setting immediately and makes it effective
   without a button.
4. Extend the page test: toggling the checkbox with `titleEnabled: false`
   answers a `PUT` with `titleEnabled: true` without clicking any button, and
   the `Gespeichert.`/`Saved.` line appears.

## Non-goals

- No server change: `PUT /api/v1/settings/branding` and the title gating of the
  report form, the internal form, the ticket view and the QR resolve stay as
  they are (WP-M2-89, WP-M9-23 … WP-M9-25).
- No change of the shared save button: it still saves name, logo and the
  current checkbox value.
- No new i18n keys, no new route, no schema, no migration.
- No new UI element next to the checkbox.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run build
npm run wp:check
```

Expected: all green; the new test fails before the change and passes after it.
`npm run test:e2e` stays a notice here — this container has no Docker/browser.

## Handoff

- Files changed: the branding page, its test, `de` and `en` `common.json`
- Interfaces added: immediate checkbox save on `BrandingPage`
- Verified: typecheck, lint, `test:run` for the page test, `i18n:check`, build, `wp:check`
- Follow-up WP: none
- Open question: none
