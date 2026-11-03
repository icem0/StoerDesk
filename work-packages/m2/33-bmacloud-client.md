# WP-M2-33: BMAcloud read-only client and its environment

format: small-model
status: planned
depends-on: WP-M2-32
phase: 2
context-budget: 16k tokens
spec: specs/17-bmacloud-sync.md §17.2 (source, endpoints, rate limit), §17.6; ADR-0003
(credentials, GET-only)
spec-lines: 60

files-read:

- specs/17-bmacloud-sync.md §17.2, §17.6
- docs/DECISIONS/0003-bmacloud-object-sync.md
- apps/api/src/config/env.ts — the Zod environment and its defaults
- apps/api/src/notifications/channels/matrix.ts — the `fetch`-injectable adapter pattern
- .env.example — the template that `PLAN.md` §15 requires to be complete

files-write:

- apps/api/src/integrations/bmacloud/client.ts
- apps/api/src/config/env.ts
- .env.example

interfaces:

- `BMA_API_BASE_URL` (default `https://bmacloud.de/api/v2/`), `BMA_API_KEY` (default `''`),
  `BMA_SYNC_ENABLED` (default `true`), `BMA_SYNC_CRON` (default `15 3 * * *`)
- `BmaCloudConfig { baseUrl: string; apiKey: string }`
- `createBmaCloudClient(config, fetchImpl?): BmaCloudClient`
- `BmaCloudClient.listAnlagen(): Promise<BmaAnlage[]>` — `GET /anlagen`
- `BmaCloudClient.anlage(aid: string): Promise<BmaAnlage | null>` — `GET /anlagen/{aid}`
- error codes `bma_not_configured` (empty key), `bma_request_failed` (non-2xx or network),
  `bma_bad_response` (body is not an array) — never a translated message, never the key

## Task

1. `apps/api/src/integrations/bmacloud/client.ts`: the four named client calls only; the
   private request helper hard-codes `method: 'GET'`, so no write endpoint of BMAcloud is
   reachable. It joins `baseUrl` and the path without doubling slashes, sends
   `Authorization: Bearer <key>` and `accept: application/json`, and never puts the key in
   a log line, an error message or an error param.
2. `listAnlagen()` returns the array of one `GET /anlagen` call; `anlage(aid)` returns the
   single object or `null` for `404`.
3. Add the four `BMA_*` keys to the Zod environment with the defaults above and mirror all
   four in `.env.example` with **empty** values for the secret
   (`PLAN.md` §15: complete template, no secret in the repository).
4. Test `apps/api/src/integrations/bmacloud/__tests__/client.spec.ts` with synthetic
   fixtures and an injected fetch: the bearer header is sent, a trailing slash in the base
   URL does not produce `//`, a `500` answers `bma_request_failed`, a non-array body
   answers `bma_bad_response`, an empty key answers `bma_not_configured` **before** any
   fetch happens, and the client type exposes no method that could write.

## Non-goals

- No mapping into `objects` and no database access (WP-M2-35).
- No pg-boss schedule and no admin route (WP-M2-36).
- No `GET /anlagen/{aid}/status` (Mängel) — ADR-0003 rejects it for the rate limit.
- No reference-data import (`anlagengruppen`, `anlagentypen`, `schnittstellen`).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new spec runs without a database. No network call in any test.

## Handoff

- Files changed: the three files above plus the new spec, `docs/REPO-MAP.md`,
  `work-packages/README.md`
- Interfaces added: `createBmaCloudClient`, `BmaCloudClient`, the four `BMA_*` env keys
- Verified: —
- Follow-up WP: WP-M2-34 (the `bma_sync_runs` table), WP-M2-35 (the sync service)
- Open question: none
