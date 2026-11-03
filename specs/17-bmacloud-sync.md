# StörDesk — Specification Slice 17: BMAcloud object sync

This slice covers chapter 17: pulling the maintenance objects (Anlagen) of the
BMAC cloud API v2 into the StörDesk object list. It is new content (no supplied
original); `PLAN.md` §11 and §19 hold the binding summary until this slice is
reviewed.

## 17.1 Purpose

The object list (`specs/02-data-model.md` §4.3) is filled from BMAcloud by a
daily, read-only pull. Each Anlage becomes exactly one StörDesk object
(`specs/02-data-model.md` §4.3.1: `object_no` is user input, unique over
`lower(object_no)`).

## 17.2 Source

API v2, OpenAPI 3.0 at `https://www.bmacloud.de/api-spec/v2/api.yaml`, server
`https://bmacloud.de/api/v2/`, auth `Authorization: Bearer <key>` (hex string),
rate limit 240 requests per window.

Read-only endpoints used:

- `GET /anlagen` (optional `?nr=`): complete object set, one call per run.
- `GET /anlagen/{aid}`: a single object (reference).
- `GET /anlagengruppen`, `GET /anlagentypen`, `GET /schnittstellen`: reference
  data (groups, BMA types, interfaces) — informational only in v1.

Not used (write endpoints): `POST /anlagen`, `PUT /anlagen/{id}`,
`PUT /anlagen/{id}/melder`, `PUT /anlagen/{id}/status`. The client hard-codes
method `GET`.

## 17.3 Mapping (one Anlage = one object)

| StörDesk field | Source | Rule |
|---|---|---|
| object_no | nr | verbatim (dots allowed, e.g. `10297_02.11`); a value with whitespace is a conflict |
| name | firma + anlagenort | `firma`; append ` – ` + `anlagenort` when present and different |
| street | str | verbatim (house number included); `house_number` stays null |
| postal_code | plz | trimmed |
| city | ort | verbatim |
| active | status | `true` iff `status === 'active'` (`sleep` → inactive) |
| external_id | aid | stable system key |
| qr_token | — | generated on insert (WP-M2-02), never rotated by sync |

Not imported: `ppmail`, `mail`, `tel`, `telAG`, `ansprechpVN/NN`, `notizen`,
`bemerkung`, `assetnr` (PII or locally maintained). `notes` is never touched
by the sync.

## 17.4 Sync behaviour

- Match by `external_id` (aid) first, then by `lower(object_no)`.
- Objects with `external_id`: BMAcloud wins for name, street, postal_code,
  city, active flag. `notes`, contact fields, `qr_token` remain local.
- Local object without `external_id` colliding on `object_no`: conflict,
  recorded in the run log, never overwritten.
- Anlagen missing from the pull: `active = false` (soft deactivation); never
  deleted (`tickets.object_id` RESTRICT).
- Each run writes one row to `bma_sync_runs`: started_at, finished_at, status,
  total/created/updated/unchanged/deactivated counts, conflicts (jsonb), error
  code.

## 17.5 Schedule and trigger

pg-boss queue `bma-anlage-sync`, cron `BMA_SYNC_CRON` (default `15 3 * * *`),
toggle `BMA_SYNC_ENABLED` / DB setting `bma.sync.enabled` / `bma.sync.cron`.
Admin API (`object.read` / `object.write` / `object.import`):

- `GET /api/v1/admin/bma-sync/runs` — run history with counters and conflicts.
- `POST /api/v1/admin/bma-sync/run` — manual pull ("Jetzt abgleichen").
- `GET /api/v1/admin/bma-sync/schedule` — the effective schedule pair, i.e. the stored
  `settings` rows with the `BMA_SYNC_*` environment as fallback.
- `PATCH /api/v1/admin/bma-sync/schedule` — cron and enabled flag.

Admin UI page `/admin/bma-sync`: run table, conflict table, trigger button,
cron setting. Object list shows a badge for externally maintained objects.

## 17.6 Rate limit

One `GET /anlagen` call per run (plus at most three reference calls); far below
240 per window. `GET /anlagen/{aid}/status` (live Mängel) is intentionally not
called in v1 — 478 calls would exceed the limit.

## 17.7 Non-goals

- No write into BMAcloud (POST/PUT/PATCH unreachable by the client).
- No automatic ticket creation from Mängel.
- No seeding of `systems` from `anlagentypen`.
- No import of contact PII.
- No hard delete of disappeared objects.
