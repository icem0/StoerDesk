# WP-M9-08: dashboard settings and TV token

format: small-model
status: planned
depends-on: WP-M9-04
phase: 9
milestone: m9
context-budget: 14k tokens
spec: specs/11-dashboard.md §11.7, §11.8; specs/12-stats.md §12.6; ADR-0012 decision 4
spec-lines: 55

files-read:

- specs/11-dashboard.md (§11.7 TV token, §11.8 administration)
- specs/12-stats.md (§12.6 settings)
- apps/api/src/settings/deadlines.ts (settings route and upsert style)
- apps/api/src/settings/branding.ts (settings read/write pattern)
- packages/shared/src/schemas/dashboard.ts (settings schemas)
- apps/api/src/index.ts (route registration)

files-write:

- apps/api/src/settings/dashboard.ts
- apps/api/src/index.ts
- apps/api/src/settings/__tests__/dashboard.integration.spec.ts

interfaces:

- `readDashboardSettings(database)` — `{ tvToken, tvAnonymize, conspicuousThreshold }`
- `verifyTvToken(database, token)` — timing-safe comparison
- `settingsDashboardRoutes` — `GET/PUT /api/v1/settings/dashboard` (`settings.read`/`settings.write`)

## Task

1. Add `apps/api/src/settings/dashboard.ts`: read the three keys of
   `specs/12-stats.md` §12.6 from `settings`, fall back to `tvAnonymize = false`
   and `conspicuousThreshold = 3`, and generate a random 32-byte `base64url` TV
   token once when the row is missing, then persist it.
2. `PUT /api/v1/settings/dashboard` updates `dashboard.tv_anonymize` and
   `stats.conspicuous_threshold`; `{ rotateTvToken: true }` replaces
   `dashboard.tv_token` with a fresh random value. Never log or answer the token
   on any other route.
3. `verifyTvToken(database, token)` compares with `timingSafeEqual` and answers
   false for any mismatch or missing row.
4. Register the plugin in `apps/api/src/index.ts` next to the other settings
   routes.
5. Add an integration test: the first `GET` creates a token, a second `GET`
   keeps it, `rotateTvToken` changes it, the threshold validates 1–100, and the
   write routes require `settings.write`.

## Non-goals

- No TV snapshot route (WP-M9-09).
- No admin page (WP-M9-17).
- No `SESSION_SECRET`-based token; the stored random token is rotatable.
- No statistics key other than the conspicuous threshold.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the settings test runs against a throwaway database and
skips with a named reason otherwise.

## Handoff

- Files changed: the dashboard settings module, the server registration, the settings test
- Interfaces added: `GET/PUT /api/v1/settings/dashboard`, `readDashboardSettings`, `verifyTvToken`
- Verified: typecheck, lint, test:run, wp:check
- Follow-up WP: WP-M9-09 (TV route), WP-M9-17 (admin page)
- Open question: none
