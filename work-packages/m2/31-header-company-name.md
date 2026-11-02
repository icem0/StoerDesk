# WP-M2-31: company name in the shell header

format: small-model
status: planned
depends-on: WP-M2-30
phase: 2
context-budget: 12k tokens
spec: PLAN.md §14 (header), §19 ("name and logo")
spec-lines: 15

files-read:

- apps/web/src/components/Shell.tsx — the header of WP-M2-28
- apps/web/src/lib/api.ts — `apiFetch`
- packages/shared/src/schemas/settings.ts — `brandingResponseSchema`
- apps/web/src/i18n/locales/de/common.json — the `common` namespace

files-write:

- apps/web/src/components/Shell.tsx
- apps/web/src/i18n/locales/de/common.json
- apps/web/src/i18n/locales/en/common.json

interfaces:

- the header title of `Shell` reads `GET /v1/settings/branding` under the
  `['branding']` query key and renders `common:app.titleWithCompany`
  ("{{company}} @ {{product}}") when `companyName` is not empty, otherwise
  `common:app.title` alone
- the settings menu's `administration` group gains the link `/admin/branding`
  with the label `auth.links.branding`, so the branding page of WP-M2-30 is
  reachable from the header
- the query is read-only and never blocks the header: while it is pending or has
  failed, the plain product name is shown

## Task

1. `Shell.tsx`: add a `useQuery` on `['branding']` (same key as `BrandingPage`, so
   TanStack Query shares the answer) and derive the header text.
2. `Shell.tsx`: add `{ key: 'branding', path: '/admin/branding' }` to the
   `administration` group of the settings menu.
3. `common.json` de/en: `app.titleWithCompany` with the interpolations `company` and
   `product`; `de` is "{{company}} @ {{product}}", `en` identical. `app.title` stays
   the fallback.
4. Extend the existing shell test fixture: with a stubbed branding answer the header
   shows "Beispiel @ StörDesk", with an empty `companyName` it shows "StörDesk".

## Non-goals

- No logo change: the logo is the build-time asset of WP-M2-28.
- No change to the public report form, the status page or the stickers.
- No per-user branding and no theme/colour settings.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the Playwright auth spec still passes because it never asserts
the header title.

## Handoff

- Files changed: the three files above plus the shell test, `docs/REPO-MAP.md`,
  `work-packages/README.md`
- Interfaces added: `['branding']` query in `Shell`, `app.titleWithCompany` key
- Verified: —
- Follow-up WP: none — the branding chain 28 … 31 is complete
- Open question: none
