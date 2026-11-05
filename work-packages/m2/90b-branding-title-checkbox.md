# WP-M2-90b: title switch checkbox on the branding page

format: small-model
status: implemented
depends-on: WP-M2-90
phase: 2
context-budget: 14k tokens
spec: PLAN.md §14 (settings: branding), PLAN.md §3.1 (i18n mechanics)
spec-lines: 15

files-read:

- apps/web/src/settings/branding-page.tsx — the company name form and `PUT /v1/settings/branding` (WP-M2-30)
- packages/shared/src/schemas/settings.ts — `BrandingResponse`, `UpdateBrandingRequest` (WP-M2-89)
- apps/web/src/settings/__tests__/branding-page.test.tsx — the page test pattern
- apps/web/src/i18n/locales/de/common.json — the `branding.*` keys (WP-M2-30)

files-write:

- apps/web/src/settings/branding-page.tsx — checkbox for `titleEnabled`, `PUT` carries it
- apps/web/src/i18n/locales/de/common.json — `branding.field.titleEnabled` + hint (de reference)
- apps/web/src/i18n/locales/en/common.json — same keys, English labels

interfaces:

- the branding page renders a checkbox prefilled from `BrandingResponse.titleEnabled`,
  disabled without `settings.write`; saving `PUT`s `{ companyName, titleEnabled }`
- new i18n keys `common:branding.field.titleEnabled` and `common:branding.hintTitleEnabled`,
  de and en

## Task

1. `branding-page.tsx`: after the company name label add a second label with
   `t('branding.field.titleEnabled')` and a checkbox `<input name="titleEnabled" type="checkbox">`,
   `checked={branding.data?.titleEnabled === true}` and `disabled={!mayWrite}`.
2. In `onSubmit` read the FormData: `titleEnabled: form.get('titleEnabled') === 'on'` and
   mutate `{ companyName, titleEnabled }` (the hardcoded `titleEnabled: false` goes away).
3. `common.json` de/en: the de label explains the effect on the report form:
   `"Ticket titel collecting enabled?"` plus the hint `"The public Meldeformular shows a title input
   only as long as this is switched on."` — en: "Enable ticket title collection?" and its translation.
4. `branding-page.test.tsx`: the checkbox prefills from the stubbed `GET`; a checked save
   sends `titleEnabled: true` in the `PUT` body and a unchecked save sends `false`.

## Non-goals

- No server change (WP-M2-89/90 own the API side).
- No title input in the report form (WP-M2-90c).
- No persistence beyond the existing branding jsonb row.

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

- Files changed: `apps/web/src/settings/branding-page.tsx`,
  `apps/web/src/settings/__tests__/branding-page.test.tsx`,
  `apps/web/src/i18n/locales/de/common.json`, `apps/web/src/i18n/locales/en/common.json`
- Interfaces added: `PUT /api/v1/settings/branding` carries `titleEnabled`,
  the checkbox prefills from `BrandingResponse.titleEnabled`; i18n keys
  `common:branding.field.titleEnabled` and `common:branding.hintTitleEnabled` (de, en)
- Verified: local gates green (`npm run check` after the change); e2e skipped
  locally (no Chromium) — CI carries the check run of this tag
- Follow-up WP: WP-M2-90c (report form title field) — still open, next M2 item
- Open question: none
