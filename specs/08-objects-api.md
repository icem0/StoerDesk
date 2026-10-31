# 08 — Objects and API (chapter 9)

**Chapter:** 9
**Scope:** ~180 lines across phases; filled for the object list API
**Status:** §9.1 is taken from `PLAN.md` §11 and
[`specs/02-data-model.md`](02-data-model.md) §4.3–§4.4 and was reviewed for
WP-M2-01. §9.2–§9.5 stay owned by `PLAN.md` §11 until their own work package.

> The source of this slice is `PLAN.md` §11 (objects, QR, stickers, CSV, REST
> API). The data contract of the object list comes from
> `specs/02-data-model.md`; this slice only describes the HTTP surface. Details
> that `PLAN.md` settled are marked **(plan)**.

## 9 — Objects and API

### 9.1 Object list API (WP-M2-01)

The object list is maintained through the admin API. Every route requires a
session cookie and enforces the permission in the table below on the server;
the UI is never the enforcement point.

| Method | Path                     | Permission      | Result |
| ------ | ------------------------ | --------------- | ------ |
| GET    | `/api/v1/objects`        | `object.read`   | `200 { objects }` |
| GET    | `/api/v1/objects/:objectNo` | `object.read` | `200` object summary |
| POST   | `/api/v1/objects`        | `object.write`  | `201` object summary |
| PATCH  | `/api/v1/objects/:objectNo` | `object.write` | `200` object summary |
| DELETE | `/api/v1/objects/:objectNo` | `object.delete` | `204` |

The path uses the human- and system-readable `object_no`, not the UUID
(§4.3.1, **(plan)**). The lookup is case-insensitive; input is trimmed and
normalised to upper case before validation and storage.

**Object summary.** `id`, `objectNo`, `name`, `street`, `houseNumber`,
`postalCode`, `city`, `contactName`, `contactPhone`, `contactEmail`,
`externalId`, `active`, `notes` and `systems`. Address and contact fields are
nullable. `systems` is an array of `{ id, type, label }`; `type` is one of
`BMA`, `LICHTRUF`, `RWA`, `EMA`, `SPRACHALARM`, `SONSTIGE`. The optional QR
tokens and the timestamps stay internal until WP-M2-02/03 need them.

**List query.**

- `search` — case-insensitive contains over `object_no`, `name`, `street`,
  `city` and `external_id`.
- `active` — `true` (default), `false` or `all`; the default hides soft-deleted
  rows.
- `city` — case-insensitive exact match.
- `systemType` — one of the six types; matches objects that have at least one
  system of that type.

Rows are ordered by `objectNo`. An invalid query value answers
`400 invalid_request` with the field path.

**Create and update.**

- `objectNo` is required on create and follows
  `^[A-Z0-9][A-Z0-9_-]{0,31}$` (§4.3.1). It may be corrected through PATCH; a
  duplicate — including one that differs only in case — answers
  `422 object_no_taken` with `fields: ['objectNo']`.
- `name` is required and non-empty; address, contact and `externalId` are
  optional, `notes` is internal free text.
- `systems` is optional on create and PATCH. On PATCH the submitted array is the
  new set: entries with an `id` are updated, entries without an `id` are
  inserted and systems missing from the array are deleted. An `id` that does not
  belong to the object answers `400 invalid_request`. QR tokens are never
  accepted from the client and never change through this API.
- An empty PATCH body is a no-op (`200` with the unchanged summary).

**Errors.** Unknown `object_no` answers `404 object_not_found`; malformed
bodies, queries or path values answer `400 invalid_request` with field paths;
a missing session answers `401 session_invalid`, a missing permission
`403 forbidden`. The bodies are always `{ code, params }`, never translated
text.

Soft delete sets `active = false` and keeps the row and its systems for
history **(plan)**. It is idempotent: deleting an already inactive object still
answers `204`.

### 9.2 QR codes (planned)

QR generation, token regeneration and the 30-day redirects are implemented by
WP-M2-02; the rules stay in `PLAN.md` §11 until that slice is filled.

### 9.3 Printable stickers (planned)

A6/A4 print views and the 112 notice are implemented by WP-M2-03; the rules stay
in `PLAN.md` §11 until that slice is filled.

### 9.4 CSV import (planned)

Upload, column mapping, preview and upsert by `object_no` stay in `PLAN.md` §11
until their work package exists.

### 9.5 REST API for external systems (planned)

API keys, scopes, `PUT /objects/{object_no}`, bulk upsert, webhooks and OpenAPI
stay in `PLAN.md` §11 (phase 10) until their work package exists.
