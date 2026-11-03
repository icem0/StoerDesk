# ADR-0005: BMAcloud bearer key configurable in the administration

- Status: accepted (supersedes the credential rule of ADR-0003)
- Date: 2026-11-03
- Stakeholders: product owner, maintenance office, deployment operator

## Context

ADR-0003 put the tenant key of the BMAcloud pull sync into `.env`/the runtime
environment only. Everything else of that sync is administered in the browser at
`/admin/bma-sync`: schedule, enabled flag, manual trigger, run history. A stack
started from the published images (`docker compose pull`, a deployment panel that
only maps volumes) has no comfortable way to edit `.env`, so the sync stays dark
and the page answers `bma_not_configured` — the admin sees a working page with a
button that cannot work and no field to fix it.

## Decision

- **Storage.** The key may live in the existing `settings` table under the new key
  `bma.api.key` (jsonb string, same upsert pattern as `bma.sync.enabled` and
  `bma.sync.cron`). No new table, no migration.
- **Resolution order.** The effective key per run is: the stored row (trimmed,
  non-empty) first, `BMA_API_KEY` as fallback, unconfigured when neither exists.
  That is the schedule rule of ADR-0003 turned around — the stored value wins over
  the environment, because the admin who sets it in the UI means it.
- **Admin routes** (ADR-0003 keeps holding: no new permission key):
  `GET /api/v1/admin/bma-sync/credentials` (`object.read`) answers
  `{ configured, source }` with `source` in `db` | `env` | `none`;
  `PUT` the same path (`object.import`) stores the trimmed key, 1–512 characters;
  `DELETE` the same path (`object.import`) removes the row, so the environment
  fallback applies again.
- **Write-only value.** No route, log line, run row, error payload or health answer
  returns the stored key; `PUT` answers `{ configured: true, source: 'db' }`. Every
  `settings` read in the codebase is key-scoped (branding, schedule, credentials), so
  no endpoint lists `settings` values and none can expose the row.
- **No restart.** The manual trigger and the pg-boss worker read the effective key
  per run, so a stored or deleted key takes effect immediately; the scheduler still
  refuses to start while neither source has a key.

## Alternatives

- Environment only, as ADR-0003 decided: rejected — image-based deployments cannot
  set it, and the reported `bma_not_configured` is then unfixable from the product.
- Encrypted at rest with a separate application secret: rejected for now — the API
  process holds the plaintext anyway and whoever reads the database or the host also
  reads the secret; it adds key management without raising the real trust level.
  Recorded as a possible hardening step.
- New permission `object.sync`: rejected — ADR-0003 already rejected it and the
  guards `object.read` (status) and `object.import` (write, because the key is the
  capability of the import) fit.
- A dedicated column or table for the key: rejected — nothing queries it by
  anything but its key; `settings` is the row the schedule already uses.

## Consequences

- New `settings` key `bma.api.key`, three admin routes, the shared schemas
  `bmaApiKeyRequestSchema` and `bmaCredentialsResponseSchema`, the helper
  `readBmaApiKey` used by the route and the job, and an API-key field on the page.
- Database backups now contain the tenant key: they carry the same protection
  requirement as `.env` (SECURITY.md), and a leaked backup leaks the BMAcloud access.
- `.env.example` marks `BMA_API_KEY` as the fallback instead of the only source.
- Work packages: **WP-M2-45** (contract, routes), **WP-M2-46** (scheduled job),
  **WP-M2-47** (admin UI field).
