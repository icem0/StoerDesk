# ADR-0003: BMAcloud pull sync of maintenance objects (Anlagen)

- Status: accepted
- Date: 2026-11-02
- Stakeholders: product owner, maintenance office

## Context

StörDesk shall show the BMAC cloud (7systems GmbH) maintenance objects as the
object table of the Störungsdesk app. The BMAcloud API v2 delivers the Anlagen
with the bearer key of the tenant. The user wants a daily, **read-only** pull:
nothing may be written into BMAcloud. Deviations from BMAcloud overwrite the
local object data; a button triggers the pull on demand; the schedule is
configurable; object lists can be exported to and imported from CSV.

Live verification against https://bmacloud.de/api/v2/ with the tenant key:
`GET /anlagen` returns 478 Anlagen in one call (45 fields each, always filled),
`GET /anlagen/{aid}/status` gives live state plus a Mängel list, rate limit is
240 requests per window. `aid` is the stable system key, `nr` the object number
(`10372_01`, sometimes `10297_02.11`, max 17 characters), `firma` + `anlagenort`
the name, `str`/`plz`/`ort` the address, `status` active|sleep.

## Decision

- **Read-only client.** `apps/api/src/integrations/bmacloud/client.ts` offers
  `GET /anlagen`, `GET /anlagen/{aid}`, `GET /anlagengruppen`,
  `GET /anlagentypen`, `GET /schnittstellen` only. The private request helper
  hard-codes method `GET`; POST/PUT/PATCH are unreachable. `POST /anlagen`,
  `PUT /anlagen/{id}`, `PUT /melder` ("überschreibt alle Melder") are never
  called.
- **Schedule.** pg-boss queue `bma-anlage-sync`, cron `BMA_SYNC_CRON`
  (default `15 3 * * *`, overridable by the DB setting `bma.sync.cron`), toggle
  `BMA_SYNC_ENABLED` / setting `bma.sync.enabled`. One request per run
  (`GET /anlagen`); far below the rate limit of 240.
- **Credentials.** `BMA_API_BASE_URL` (default `https://bmacloud.de/api/v2/`)
  and `BMA_API_KEY` (bearer, hex). Key lives only in `.env`/runtime env; never
  logged, never in health answers, never committed (`.env.example` has empty
  values).
- **Mapping (1 Anlage = 1 Objekt).** `object_no = nr` verbatim (dots allowed;
  the one value with whitespace is a conflict, not an object), `name = firma`
  plus ` – anlagenort` when that differs and is non-empty, `street = str`
  (house number included, `house_number` stays null), `postal_code = plz`
  trimmed, `city = ort`, `active = (status === 'active')`, `external_id = aid`.
  `qr_token` is generated on insert (WP-M2-02 generator); sync never rotates it.
  Not imported (PII / locally maintained): `ppmail`, `mail`, `tel`, `telAG`,
  `ansprechp*`, `notizen`, `bemerkung`, `assetnr`.
- **Conflict policy.** Objects carrying `external_id` are overwritten by BMAcloud
  for name, address and active flag (`notes`, contact fields, `qr_token` stay
  local). A local object without `external_id` that collides on `object_no` is a
  conflict: it is written into the run log, never overwritten. Anlagen that
  disappear from BMAcloud are soft-deactivated (`active = false`), never deleted
  (`tickets.object_id` is `ON DELETE RESTRICT`).
- **Run log.** New table `bma_sync_runs` (started/finished, counters
  created/updated/unchanged/deactivated, conflicts as jsonb, error code).
  Admin API: `GET /api/v1/admin/bma-sync/runs`, `POST .../run` (manual trigger),
  `PATCH .../schedule` (cron + enabled); guards reuse `object.read` /
  `object.write` / `object.import` (no new permission keys). Admin UI page at
  `/admin/bma-sync` with run table, conflict table, "Jetzt abgleichen" and the
  cron setting.
- **Out of scope v1.** `GET /anlagen/{aid}/status` (Mängel, 478 calls exceed
  the rate limit), seeding `systems` from `anlagentypen`, automatic ticket
  creation from Mängel.

## Alternatives

- One object per `nr` prefix (aggregation): rejected — 37 of 187 prefixes have
  more than one address.
- Pull the live status of every Anlage daily: rejected — 478 calls exceed the
  240 request limit.
- Hard-delete disappeared objects: rejected — ticket foreign keys.
- New permission `object.sync`: rejected — reuse `object.read` /
  `object.write` / `object.import`.

## Consequences

- New table `bma_sync_runs` (migration `0007`), new env pair
  `BMA_API_BASE_URL` / `BMA_API_KEY`, new pg-boss job,
  admin API and UI page, CSV export/import in later WPs.
- `object_no` schema allows `.` (156 of 478 live numbers need it).
- 478 objects from the live tenant after the first sync run.
- Tests use synthetic fixtures only — no real PII from the API analysis.
