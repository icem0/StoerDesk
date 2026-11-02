# WP-M2-30: branding input field in the administration

format: small-model
status: planned
depends-on: WP-M2-29
phase: 2
context-budget: 16k tokens
spec: PLAN.md §14 (settings: users, …), specs/13-ui.md (administration area)
spec-lines: 20

files-read:

- apps/api/src/settings/branding.ts — `GET|PUT /api/v1/settings/branding` (WP-M2-29)
- packages/shared/src/schemas/settings.ts — the branding schemas
- apps/web/src/admin/users-page.tsx — the admin form and error-code pattern
- apps/web/src/routes/index.tsx — the guarded `/admin/*` routes
- apps/web/src/auth/usePermission.ts — `usePermission` for the save button

files-write:

- apps/web/src/settings/branding-page.tsx
- apps/web/src/routes/index.tsx
- apps/web/src/i18n/locales/de/common.json
- apps/web/src/i18n/locales/en/common.json

interfaces:

- `BrandingPage` React component at the guarded route `/admin/branding`: reads
  `GET /v1/settings/branding`, shows one text input for the company name and a save
  button that `PUT`s the value and invalidates the `['branding']` query
- new i18n keys `common:branding.*` (title, hint, field label, save, saved notice,
  error labels) — de reference, en complete
- labels live in the `common` namespace, not in `settings`: the `settings` namespace
  is being edited by WP-M2-26 at the same time and two sessions must not write the
  same locale file

## Task

1. `branding-page.tsx`: `useQuery` on `['branding']` + `useMutation` on
   `PUT /v1/settings/branding`; the form prefills from the response, disables the
   save button while the mutation runs and while the user lacks `settings.write`,
   and shows the localized notice after a successful save.
2. Error mapping follows `users-page.tsx`: `ApiError.code` of
   `session_invalid`, `forbidden`, `invalid_request` maps to `branding.errors.<code>`,
   anything else to `branding.errors.unknown`.
3. Route `/admin/branding` wrapped in `RequireSession` in `routes/index.tsx`.
4. Add the `branding` keys to `common.json` in `de` and `en`; the `de` field label is
   "Firmenname", the hint explains that an empty value shows only "StörDesk".
5. Test `apps/web/src/settings/__tests__/branding-page.test.tsx`: the input is
   prefilled from a stubbed `GET`, saving sends the typed value to `PUT` and shows
   the saved notice.

## Non-goals

- No logo upload and no logo colour or theme picker.
- No live preview of the header — the preview is the header of WP-M2-31.
- No permission filtering of the route (the server guard enforces, `PLAN.md` §3.2).

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

- Files changed: the four files above plus the page test, `docs/REPO-MAP.md`,
  `work-packages/README.md`
- Interfaces added: `BrandingPage`, route `/admin/branding`, `common:branding.*`
- Verified: —
- Follow-up WP: WP-M2-31 (company name in the shell header)
- Open question: none
