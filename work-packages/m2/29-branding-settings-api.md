# WP-M2-29: branding settings API

format: small-model
status: implemented
depends-on: WP-M2-28
phase: 2
context-budget: 16k tokens
spec: PLAN.md §14 (settings), §6 (`settings` key/value table), PLAN.md §3 (errors are `{ code, params }`)
spec-lines: 20

files-read:

- apps/api/src/db/schema.ts — the `settings` table (key `text` primary key, `value` jsonb)
- apps/api/src/admin/roles.ts — the fp plugin, guard and error shape pattern
- apps/api/src/auth/requirePermission.ts — the OR-semantics permission guard
- packages/shared/src/schemas/role.ts — the shared Zod schema pattern
- apps/api/src/index.ts — route registration
- packages/shared/src/permissions.ts — `settings.read` / `settings.write`

files-write:

- packages/shared/src/schemas/settings.ts
- packages/shared/src/schemas/index.ts
- apps/api/src/settings/branding.ts
- apps/api/src/index.ts

interfaces:

- `brandingResponseSchema` — `{ companyName: string }`, `''` means "no company name,
  show the product name alone"
- `updateBrandingRequestSchema` — `{ companyName: string }`, trimmed, max 80 chars
- `GET /api/v1/settings/branding` — guarded by `settings.read`, answers
  `{ companyName }`, `''` when the row does not exist
- `PUT /api/v1/settings/branding` — guarded by `settings.write`, upserts the row,
  answers the stored `{ companyName }`; a malformed body answers
  `400 { code: 'invalid_request', params: { fields: ['companyName'] } }`
- stored in the existing `settings` table under the key `branding` — no new table,
  no migration

## Task

1. `packages/shared/src/schemas/settings.ts`: `brandingResponseSchema` and
   `updateBrandingRequestSchema` as above; re-export from `schemas/index.ts`.
2. `apps/api/src/settings/branding.ts`: an `fp` plugin `settingsBrandingRoutes`
   taking `{ database }`. `readBranding(database)` selects the `branding` row and
   answers `''` when it is missing; `writeBranding(database, companyName)` upserts
   with `onConflictDoUpdate` on `settings.key` and returns the parsed value.
3. Guards: `requirePermission(database, PERMISSIONS.settings.read)` on `GET`,
   `PERMISSIONS.settings.write` on `PUT`. Unknown body keys are rejected through the
   strict schema; the error contract stays `{ code, params }` (never a translated
   message).
4. Register the plugin in `apps/api/src/index.ts` next to the other admin plugins.
5. Test `apps/api/src/settings/__tests__/branding.integration.spec.ts` (same
   `testDatabase` harness as the role tests): anonymous is `401`, a user without the
   permission is `403`, `GET` before any write answers `''`, `PUT` stores and
   survives a re-read, `PUT ''` resets, a 200-char name is `400 invalid_request`.

## Non-goals

- No logo upload, no logo URL: the logo is a build-time asset (WP-M2-28), an upload
  would need the uploads volume and an authenticated file endpoint of its own.
- No public read endpoint: the public report form keeps its current header until a
  separate decision (`PLAN.md` §19 "name and logo").
- No other `settings` keys and no settings UI — the input field is WP-M2-30.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new integration test really runs (a reachable database is
required — if it skips, report it as unverified, never as green).

## Handoff

- Files changed: the four files above plus the integration test,
  `docs/REPO-MAP.md`, `work-packages/README.md`
- Interfaces added: `brandingResponseSchema`, `updateBrandingRequestSchema`,
  `GET|PUT /api/v1/settings/branding`
- Verified: —
- Follow-up WP: WP-M2-30 (branding input field in the administration)
- Open question: none
