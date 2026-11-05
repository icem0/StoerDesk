# WP-M2-89: public report optional title with settings switch

format: small-model
status: implemented
depends-on: WP-M2-29
phase: 2
context-budget: 18k tokens
spec: PLAN.md §10 (report form fields), PLAN.md §6 (tickets.title), PLAN.md §3 (i18n, errors)
spec-lines: 30

files-read:

- packages/shared/src/schemas/ticket.ts — `publicReportRequestSchema`, WP-M2-04b
- packages/shared/src/schemas/settings.ts — `brandingResponseSchema`, `updateBrandingRequestSchema`, WP-M2-29
- apps/api/src/settings/branding.ts — `settingsBrandingRoutes`, WP-M2-29
- apps/api/src/tickets/report.ts — `createPublicReport`, WP-M2-04b
- apps/api/src/db/schema.ts — `tickets.title` nullable text, WP-M2-04

files-write:

- packages/shared/src/schemas/ticket.ts — add optional `title` to `publicReportRequestSchema`
- packages/shared/src/schemas/settings.ts — add `titleEnabled` to branding schemas
- apps/api/src/settings/branding.ts — read/write `titleEnabled`
- apps/api/src/tickets/report.ts — insert `title` only when `titleEnabled`

interfaces:

- `title: trimmedText(200)` optional on `publicReportRequestSchema`
- `titleEnabled: boolean` on `brandingResponseSchema` and `updateBrandingRequestSchema`, default `false`
- `GET /api/v1/settings/branding` answers `{ companyName, titleEnabled }`
- `PUT /api/v1/settings/branding` upserts `{ companyName, titleEnabled }`
- `POST /api/v1/public/tickets` stores `title` only when `titleEnabled` is true, otherwise `NULL`

## Task

1. `packages/shared/src/schemas/settings.ts`: add `titleEnabled: z.boolean().default(false)` to `updateBrandingRequestSchema` and to `brandingResponseSchema`.
2. `packages/shared/src/schemas/ticket.ts`: add `title: trimmedText(200)` to `publicReportRequestSchema` (optional, empty string → `undefined`).
3. `apps/api/src/settings/branding.ts`: `storedBranding` reads `titleEnabled` from the jsonb value (`false` when missing); `PUT` upserts `{ companyName, titleEnabled }`.
4. `apps/api/src/tickets/report.ts`: read `titleEnabled` from the `branding` settings row inside `createPublicReport`; only include `title: input.title ?? null` in `insertValues` when `titleEnabled` is true, otherwise `NULL`. Add `title` to the `created` event payload when present.
5. Test `apps/api/src/settings/__tests__/branding.integration.spec.ts` (extend existing test file): `titleEnabled` defaults to `false`, `PUT { titleEnabled: true }` stores and survives re-read, `PUT { titleEnabled: false }` resets.

## Non-goals

- No UI (WP-M2-90).
- No new table, no migration: `titleEnabled` lives in the existing `settings` jsonb row under `branding`.
- The `title` column already exists and is nullable (`WP-M2-04`); no schema change.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new test really runs (a reachable database is required — if it skips, report it as unverified, never as green).

## Handoff

- Files changed: the four source files above plus the extended integration test, `docs/REPO-MAP.md`, `work-packages/README.md`
- Interfaces added: `titleEnabled` on branding schemas/routes, optional `title` on `publicReportRequestSchema`
- Verified: `npm run typecheck`, `npm run lint`, `npm run test:run`, `npm run i18n:check`, `npm run wp:check` all green; 463 tests pass.
- Follow-up WP: WP-M2-90 (QR resolve `titleEnabled`) and WP-M2-90b (report form title field, branding checkbox)
- Open question: none
