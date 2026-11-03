# WP-M2-45: BMAcloud bearer key in the settings row and its admin routes

format: small-model
status: implemented
depends-on: WP-M2-36, ADR-0005
phase: 2
context-budget: 16k tokens
spec: specs/17-bmacloud-sync.md §17.5 (credentials), ADR-0005
spec-lines: 30

files-read:

- apps/api/src/integrations/bmacloud/routes.ts — the `settings` upsert, `readBmaSyncSchedule`
  and the `bma_not_configured` guard of the trigger
- packages/shared/src/schemas/bmacloud.ts — the existing run/schedule contracts
- apps/api/src/integrations/bmacloud/client.ts — how an empty key answers
  `bma_not_configured`
- apps/api/src/jobs/bma-sync.ts — reads `BMA_API_KEY` at start (WP-M2-46 changes that)
- apps/api/src/integrations/bmacloud/**tests**/routes.integration.spec.ts — guards and the
  409-without-a-key test
- specs/17-bmacloud-sync.md — §17.5 route list

files-write:

- packages/shared/src/schemas/bmacloud.ts
- apps/api/src/integrations/bmacloud/routes.ts
- apps/api/src/integrations/bmacloud/__tests__/routes.integration.spec.ts
- .env.example

interfaces:

- `readBmaApiKey(database, env): Promise<string>` and
  `readBmaCredentials(database, env): Promise<BmaCredentialsResponse>` in `routes.ts`,
  plus `BMA_API_KEY_SETTING = 'bma.api.key'` and `BmaCredentialEnv`
- `GET /api/v1/admin/bma-sync/credentials` (`object.read`) → `{ configured, source }` with
  `source: 'db' | 'env' | 'none'`
- `PUT /api/v1/admin/bma-sync/credentials` (`object.import`, body `{ apiKey }`) →
  `{ configured: true, source: 'db' }`, never the key
- `DELETE /api/v1/admin/bma-sync/credentials` (`object.import`) → the effective credentials
  again, i.e. the environment fallback
- shared: `BMA_API_KEY_MAX_LENGTH`, `bmaApiKeyRequestSchema`, `BMA_API_KEY_SOURCES`,
  `bmaCredentialsResponseSchema`, `BmaApiKeyRequest`, `BmaCredentialsResponse`

## Task

1. Add the shared contracts of ADR-0005 to `bmacloud.ts`: the key length cap 512, the
   request schema (trimmed, 1–512 characters) and the response schema
   `{ configured, source }` over the sources `db`/`env`/`none`.
2. In `routes.ts` add `BMA_API_KEY_SETTING = 'bma.api.key'`, a private `storedApiKey`
   reader and the exported `readBmaApiKey` (stored row first, trimmed `BMA_API_KEY`
   fallback, `''` when neither) plus `readBmaCredentials`.
3. Change the manual trigger to take `await readBmaApiKey(database, env)`; the 409
   `bma_not_configured` stays for the case that both sources are empty.
4. Add the three credential routes with the guards `object.read` (status) and
   `object.import` (write and delete). The `PUT` answers the status only — the stored
   value never leaves the API.
5. Test in the existing integration spec: anonymous `401` on all three routes,
   `reporter_internal` reads the status with `200` but may not write (`403`), the status
   is `none` while nothing is set, `PUT` stores the row and answers `source: 'db'`
   without echoing it, an empty or oversized key answers `400` with the field path, and
   after the stored key the trigger no longer answers 409 but reaches the client
   (`502 bma_request_failed` against an unreachable `BMA_API_BASE_URL`, still no run
   row). `DELETE` removes the row and the status falls back to `none`.
6. `.env.example`: `BMA_API_KEY` is the fallback of the `bma.api.key` row, not the only
   source.

## Non-goals

- No change of `jobs/bma-sync.ts` — the scheduled job reads the effective key in
  **WP-M2-46** (`46-bma-sync-job-effective-key.md`).
- No UI and no i18n key — **WP-M2-47** (`47-bma-sync-api-key-field-ui.md`) builds the field.
- No encryption at rest (rejected in ADR-0005) and no new permission key (ADR-0003).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the BMAcloud integration spec runs against a reachable database
(otherwise it is reported as unverified, never as green).

## Handoff

- Files changed: `packages/shared/src/schemas/bmacloud.ts`,
  `apps/api/src/integrations/bmacloud/routes.ts`, its integration spec, `.env.example`,
  `specs/17-bmacloud-sync.md` §17.5, `docs/DECISIONS/0005-bmacloud-api-key-in-settings.md`,
  `docs/DECISIONS/0003-bmacloud-object-sync.md` (status note), `docs/DECISIONS.md`,
  `PLAN.md` §11/§16, `docs/REPO-MAP.md`, `work-packages/README.md`, `CHANGELOG.md`
- Interfaces added: see the list above
- Verified: `npm run check` locally (typecheck, lint 0 errors, 305 tests, i18n parity 526
  keys de/en, wp:check 115 small-model WP); the E2E gate **skipped** — no usable Chromium in
  this container, so it stays unverified, not green. The BMAcloud folder runs 26 tests against
  a reachable throwaway database, 12 of them in the extended `routes.integration.spec.ts`
  (including the new credential tests and the `502 bma_request_failed` proof that a stored key
  is effective without a restart).
- Follow-up WP: WP-M2-46 (`46-bma-sync-job-effective-key.md`) and WP-M2-47
  (`47-bma-sync-api-key-field-ui.md`) — both files are created in this same commit
- Open question: none — the retention question of WP-M2-32 (`bma_sync_runs.conflicts`)
  is untouched
