# WP-M2-90b: report form title field and branding checkbox

format: small-model
status: planned
depends-on: WP-M2-90
phase: 2
context-budget: 18k tokens
spec: PLAN.md §10 (report form fields), PLAN.md §14 (settings: branding), PLAN.md §3.1 (i18n mechanics)
spec-lines: 20

files-read:

- apps/web/src/features/tickets/report-form-page.tsx — the form, `sendReport` body, `QrResolveResponse`
- apps/web/src/settings/branding-page.tsx — company name form, `PUT /v1/settings/branding` (WP-M2-30)
- packages/shared/src/schemas/settings.ts — `UpdateBrandingRequest`, `BrandingResponse` (WP-M2-89)
- apps/web/src/i18n/locales/de/common.json — the `branding.*` keys (WP-M2-30)
- apps/web/src/settings/__tests__/branding-page.test.tsx — the page test pattern

files-write:

- apps/web/src/features/tickets/report-form-page.tsx — conditional title input from `qr.data.titleEnabled`
- apps/web/src/settings/branding-page.tsx — checkbox for `titleEnabled`, `PUT` carries it
- apps/web/src/i18n/locales/de/common.json — new `report.titleField.label` and `branding.field.titleEnabled` (de reference)
- apps/web/src/i18n/locales/en/common.json — same keys, English labels

interfaces:

- the report form shows one optional title input (max 200 chars) only while
  `GET /api/v1/public/qr/:token` answers `titleEnabled: true`; the body carries
  `title: <trimmed value>` then, otherwise `undefined`
- `BrandingPage` renders a checkbox prefilled from `BrandingResponse.titleEnabled`;
  saving `PUT`s `{ companyName, titleEnabled }`
- new i18n keys `common:branding.field.titleEnabled` and `common:report.titleField.label`,
  de and en (the report form keeps its labels in the `common` namespace — the same
  locale-file rule as WP-M2-30)

## Task

1. `branding-page.tsx`: add a checkbox `<input name="titleEnabled" type="checkbox">` labeled
   `branding.field.titleEnabled`, prefilled `checked={branding.data?.titleEnabled === true}`,
   disabled without `settings.write`; in `onSubmit` read the FormData (`titleEnabled: form.get('titleEnabled') === 'on'`)
   and mutate `{ companyName, titleEnabled }`.
2. `report-form-page.tsx`: `const titleEnabled = qr.data?.titleEnabled === true`, a `title` state
   and a `TitleField` component rendered inside the form only when enabled (label
   `common:report.titleField.label`, textarea/input max 200). In `sendReport` set
   `title: titleEnabled && title.trim() !== '' ? title.trim() : undefined`; keep
   `title: undefined` when disabled so the offline outbox stays consistent.
3. `common.json` de/en: `branding.field.titleEnabled` = "Ticket titel collecting enabled?" (de)
   / "Enable ticket title collection?" (en); `report.titleField.label` =
   "Kurztitok (optional)" (de) / "Short title (optional)" (en).
4. Test `apps/web/src/features/tickets/__tests__/report-form-page.test.tsx` (or its existing
   file): with `titleEnabled: true` in the stubbed QR resolve the input renders and the typed
   value reaches the `POST` body; with `false` no title input renders and the body has no title.
   Update the branding page test PUT expectation to carry the checkbox value.

## Non-goals

- No title in the internal create form or the ticket detail UI.
- No server change (WP-M2-89/90 own the API side).
- No checkbox persistence beyond the existing branding jsonb row.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green.

## Handoff

- Files changed: —
- Interfaces added: —
- Verified: —
- Follow-up WP: none
- Open question: none
