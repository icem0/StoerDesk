# WP-M4-09a: Branding company logo — API and schema

format: small-model
status: done
depends-on: WP-M2-29, WP-M2-30
phase: 4
context-budget: 15k tokens
spec: PLAN.md §14, §3.1
spec-lines: 20

files-read:

- packages/shared/src/schemas/settings.ts
- apps/api/src/settings/branding.ts

files-write:

- packages/shared/src/schemas/settings.ts — add `logo` (base64 data URL) to `brandingResponseSchema` and `updateBrandingRequestSchema`
- apps/api/src/settings/branding.ts — read/write `logo` on the `branding` settings row; validate a provided logo is a `data:image/jpeg`/`data:image/png` URL within `MAX_LOGO_BYTES`; answer `{ code, params }` on violation
- apps/api/src/settings/__tests__/branding.integration.spec.ts — expect the new `logo` field

interfaces:

- `GET /api/v1/settings/branding` — answers `{ companyName, titleEnabled, logo }` (`logo` is `''` when none configured)
- `PUT /api/v1/settings/branding` — accepts `{ companyName, titleEnabled, logo? }`; `logo` may be a `data:image/jpeg` / `data:image/png` URL or `''`/`null` to remove

## Task

1. Extend `brandingResponseSchema` / `updateBrandingRequestSchema` with `logo`.
2. In `settings/branding.ts`, read `logo` from the stored jsonb value (default `''`) and include it in the `BrandingResponse`. On `PUT`, accept an optional `logo`; validate it matches `^data:image\/(jpeg|png);base64,` and is below `MAX_LOGO_BYTES` (500 kB), otherwise answer `400 invalid_request` with `params.fields = ['logo']`. Store `logo` alongside `companyName` and `titleEnabled`.

## Non-goals

- No web UI (WP-M4-09b).
- No logo image-serving route (logo travels as a data URL embedded in settings).
- No migration (logo lives in the existing `settings` jsonb row, WP-M2-29).
- No change to `companyName` / `titleEnabled` behavior.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
npm run build
```

Expected: all green; `PUT` with a non-image or oversized logo answers `400 invalid_request`.

## Handoff

- Files changed: `packages/shared/src/schemas/settings.ts`, `apps/api/src/settings/branding.ts`, `apps/api/src/settings/__tests__/branding.integration.spec.ts`
- Interfaces added: `logo` field on `GET`/`PUT /api/v1/settings/branding`
- Verified: typecheck, eslint, vitest, i18n:check, wp:check
- Follow-up WP: branding logo web UI (WP-M4-09b)
- Open question: none
