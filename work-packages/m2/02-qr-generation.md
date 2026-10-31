# WP-M2-02: QR token generation and regeneration

format: small-model
status: implemented
depends-on: WP-M2-01
phase: 2
context-budget: 24k tokens
spec: specs/08-objects-api.md §9.2, specs/02-data-model.md §4.3/§4.7
spec-lines: 55

files-read:

- specs/08-objects-api.md (§9.1 object summary, §9.2 QR tokens)
- specs/02-data-model.md (§4.3 `qr_token`, §4.7 `old_qr_tokens`)
- apps/api/src/objects/service.ts (route, guard and summary pattern)
- apps/api/src/db/schema.ts (`objects`, `systems`, `uuidDefault`)
- packages/shared/src/schemas/object.ts (`objectSummarySchema`)
- apps/api/src/objects/__tests__/objects.integration.spec.ts (test setup)

files-write:

- packages/shared/src/schemas/object.ts
- apps/api/src/db/schema.ts
- apps/api/src/objects/qr.ts
- apps/api/src/objects/service.ts

interfaces:

- `generateQrToken(): string` — 22 `base64url` characters from 128 random bits
- `qrRoutes` (fastify plugin, opts `{ database }`) with
  `POST /api/v1/objects/:objectNo/regenerate-qr` (permission
  `object.regenerate_qr`) and the public `GET /api/v1/public/qr/:token`
- shared `qrTokenSchema`, `regenerateQrRequestSchema`,
  `regenerateQrResponseSchema`, `publicQrObjectSchema`, `qrResolveResponseSchema`;
  `qrToken` added to `objectSummarySchema`
- `oldQrTokens` Drizzle table; migration `0003_old_qr_tokens`
- error codes `object_not_found` (404), `qr_token_not_found` (404),
  `invalid_request` (400), `forbidden` (403), `session_invalid` (401)

## Task

The object list exists and its rows have a nullable `qr_token`. This package
fills the column, adds retired tokens and exposes resolve/regenerate. Keep the
vertical slice inside `PLAN.md` §17; the cleanup job is WP-M2-02b.

1. `packages/shared/src/schemas/object.ts`: add `qrToken: z.string().nullable()`
   to `objectSummarySchema`. Add `qrTokenSchema` (exactly 22 characters of
   `[A-Za-z0-9_-]`), `regenerateQrRequestSchema` (`blockOldToken?: boolean`,
   default `false`), `regenerateQrResponseSchema` (`{ qrToken }`),
   `publicQrObjectSchema` (`objectNo`, `name`, address, `systems` only) and
   `qrResolveResponseSchema` (`{ token, redirected, object }`). Export the
   inferred types.
2. `apps/api/src/db/schema.ts`: add `oldQrTokens` with UUID v7 primary key,
   `objectId` FK `ON DELETE CASCADE`, not-null `token`, not-null `expiresAt`,
   `createdAt`; unique index `old_qr_tokens_token_key` and indexes on
   `object_id` and `expires_at`. Generate migration `0003_old_qr_tokens` with
   `npm run db:generate -w @stoerdesk/api`; do not hand-write SQL.
3. `apps/api/src/objects/qr.ts`: `generateQrToken()` uses
   `randomBytes(16).toString('base64url')` and returns exactly 22 characters.
   Keep the route error shape of `objects/service.ts` (`{ code, params }`).
4. `apps/api/src/objects/qr.ts` — regeneration: in one transaction look the
   object up by `lower(object_no)`, generate a new token, copy the previous
   token to `old_qr_tokens` (`now + 30 days`, or `now` when `blockOldToken` is
   true), update `objects.qr_token` and `updated_at`, answer `200 { qrToken }`.
   An object without a token gets its first token without a retired row.
5. `apps/api/src/objects/qr.ts` — public resolution: `GET
   /api/v1/public/qr/:token` (no session) looks in `objects.qr_token` first,
   then in `old_qr_tokens` joined to the object while `expires_at > now()`.
   Answer `{ token: <current token>, redirected, object }`; only active objects
   resolve; malformed tokens are `400 invalid_request`, unknown/expired/
   inactive are `404 qr_token_not_found`.
6. `apps/api/src/objects/service.ts`: `createObject` sets a generated
   `qr_token`; `summarize` now carries `qrToken`; the `objectRoutes` plugin
   registers `qrRoutes` with `{ database }`, so `apps/api/src/index.ts` stays
   unchanged.
7. Integration test (excluded from `files-write`):
   `apps/api/src/objects/__tests__/qr.integration.spec.ts` — four cases:
   create produces a unique 22-character token on two objects; regeneration
   changes the token and stores the old one with ~30 days; the old token
   resolves with `redirected: true` and stops resolving after expiry; the
   current token resolves with `redirected: false`, unknown and inactive
   objects answer `404`, and `object.regenerate_qr` denies a non-admin.
   Skipped without a reachable database.

## Non-goals

- No pg-boss cleanup job and no demo-seed token backfill (both WP-M2-02b).
- No QR image, sticker, PDF or print view (WP-M2-03).
- No public report form, no ticket and no `status_token` (WP-M2-04/05).
- No system `qr_token` generation, no CSV import, no object UI.
- No immediate-block UI; the API flag `blockOldToken` is the only switch.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green against a reachable PostgreSQL 16 (`TEST_DATABASE_URL` or
the CI service); without a database the QR spec skips and is re-run on one.

## Handoff

- Files changed: the four source files, migration `0003_old_qr_tokens`, the QR
  integration spec and the bookkeeping (`specs/`, `CHANGELOG.md`, `AGENTS.md`,
  `PLAN.md` §16, `docs/REPO-MAP.md`, `work-packages/README.md`)
- Interfaces added: shared QR schemas, `qrRoutes`, `generateQrToken`, two routes
- Verified: `npm run check` green; the four QR cases pass on PostgreSQL 16
- Follow-up WP: WP-M2-02b (demo tokens and the daily pg-boss cleanup)
