# WP-M4-09b: Branding company logo — administration UI

format: small-model
status: done
depends-on: WP-M4-09a
phase: 4
context-budget: 15k tokens
spec: PLAN.md §14
spec-lines: 15

files-read:

- apps/web/src/settings/branding-page.tsx
- apps/web/src/i18n/locales/de/common.json
- apps/web/src/i18n/locales/en/common.json

files-write:

- apps/web/src/settings/branding-page.tsx — logo file input with client-side type/size validation, current-logo preview, remove button; PUT always sends `logo`
- apps/web/src/i18n/locales/de/common.json — `branding.field.logo`, `branding.hintLogo`, `branding.logoRemove`, `branding.errors.logoInvalid`
- apps/web/src/i18n/locales/en/common.json — `branding.field.logo`, `branding.hintLogo`, `branding.logoRemove`, `branding.errors.logoInvalid`
- apps/web/src/settings/__tests__/branding-page.test.tsx — expect `logo` in the PUT body

interfaces:

- `PUT /api/v1/settings/branding` (existing, WP-M4-09a) — accepts `{ companyName, titleEnabled, logo }`

## Task

1. Web UI: logo file input (`accept="image/jpeg,image/png"`), client-side type/size validation (≤500 kB), preview of the current/selected logo, remove button.
2. i18n keys `branding.field.logo`, `branding.hintLogo`, `branding.logoRemove`, `branding.errors.logoInvalid` in `de` and `en`.

## Non-goals

- No API or schema change (done in WP-M4-09a).
- No logo image-serving route.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
npm run build
```

Expected: all green.

## Handoff

- Files changed: `apps/web/src/settings/branding-page.tsx`, `apps/web/src/i18n/locales/de/common.json`, `apps/web/src/i18n/locales/en/common.json`, `apps/web/src/settings/__tests__/branding-page.test.tsx`
- Interfaces added: none (UI on top of WP-M4-09a)
- Verified: typecheck, eslint, vitest, i18n:check, wp:check
- Follow-up WP: top-right options dropdown + PDF/E-Mail (WP-M4-10)
- Open question: none
