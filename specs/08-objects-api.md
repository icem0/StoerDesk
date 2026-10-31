# 08 — Objects and API (chapter 9)

**Chapter:** 9
**Scope:** ~180 lines across phases; filled for the object list API
**Status:** §9.1 is taken from `PLAN.md` §11 and
[`specs/02-data-model.md`](02-data-model.md) §4.3–§4.4 and was reviewed for
WP-M2-01. §9.2 (QR tokens) is filled from `PLAN.md` §11 and
`specs/02-data-model.md` §4.3/§4.7 and was reviewed for WP-M2-02. §9.3 (printable QR
stickers) is filled from `PLAN.md` §4/§11 and `PLAN.md` §2 (the 112 notice) and was
reviewed for WP-M2-03. §9.4–§9.5 stay owned by `PLAN.md` §11 until their own work
package.

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
`externalId`, `active`, `notes`, `qrToken` and `systems`. Address and contact
fields are nullable. `systems` is an array of `{ id, type, label }`; `type` is
one of `BMA`, `LICHTRUF`, `RWA`, `EMA`, `SPRACHALARM`, `SONSTIGE`. `qrToken` is
the object's current QR token and is nullable only for rows created before
WP-M2-02. Timestamps stay internal.

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

### 9.2 QR tokens (WP-M2-02)

Every object carries one `qr_token`: exactly 22 URL-safe characters from 128
random bits (`base64url`, `crypto.randomBytes(16)`), unique across the object
list and the retired tokens. The API generates it on create; the client never
supplies or changes it through the object write API. The QR content is only the
public URL with the token, never the `object_no` **(plan, §11)**.

**Regeneration.** `POST /api/v1/objects/:objectNo/regenerate-qr` requires
`object.regenerate_qr` and answers `200 { qrToken }` with the new token. The
body is optional: `{ blockOldToken?: boolean }` (default `false`). Unless the
token is blocked, the previous token is copied to `old_qr_tokens` with
`expires_at = now() + 30 days`; with `blockOldToken: true` it expires
immediately. A second regeneration keeps every earlier retired token pointing at
the same object until its own expiry. An object that has no token yet (a row
created before this package) gets one without a retired entry. Unknown
`objectNo` answers `404 object_not_found`.

**Resolution.** `GET /api/v1/public/qr/:token` is public (no session) and
resolves in this order:

1. `objects.qr_token` matches — `200 { token, redirected: false, object }`;
2. `old_qr_tokens.token` matches and `expires_at > now()` —
   `200 { token, redirected: true, object }`, where `token` is the object's
   current token;
3. otherwise `404 qr_token_not_found`.

Only active objects resolve; a soft-deleted object answers `404` even when its
token still exists. A malformed token answers `400 invalid_request`. `object` is
the public subset `{ objectNo, name, street, houseNumber, postalCode, city,
systems }`; contact data, `externalId`, `notes`, `qrToken` and timestamps stay
internal. The web route `/m/:token` uses the answer to redirect to the current
token or to render the report form (WP-M2-05).

**Cleanup.** Expired `old_qr_tokens` rows (`expires_at <= now()`) are deleted by the daily
pg-boss job of WP-M2-02b: `deleteExpiredQrTokens(database, now?)` runs in the queue
`qr-token-cleanup`, scheduled with the cron `0 3 * * *`, one short-lived pool per job, and
started only by the direct API start. Until a job has run the resolution query already
ignores expired rows. The demo seed of WP-M2-02b gives every demo object it inserts a
generated token and backfills a `NULL` token, so a demo installation is scannable without
a manual regeneration.

### 9.3 Printable QR stickers (WP-M2-03)

Stickers are printed from the browser: the web app renders an HTML print view with
`@media print` and mm page sizes **(plan, §4, §11)**. A real PDF download stays
optional and only gets its own work package if a deployment needs one — this package
adds **no API route**; the view reads the object list API of §9.1.

**Route and data.** `/objects/stickers` is a child of the guarded route
(`RequireSession`, cosmetic next to the server guard). It lists
`GET /api/v1/objects?active=true` as a checklist, every object selected by default,
and filters the checklist by a client-side `search` over object number, name and city.
Inactive (soft-deleted) objects are not printable — their token only serves the
30-day redirect of §9.2.

**Sticker content**, in this order:

1. the QR code,
2. the object name,
3. the object number,
4. the report call `object:sticker.reportCall` — German reference
   „Störung melden: QR-Code scannen" **(plan, §11)**,
5. the 112 notice `object:sticker.emergencyNotice` from `PLAN.md` §2 — multilingual,
   never hard-coded, and it must stay visible on every printed sticker.

The QR encodes only the public URL `<origin>/m/<qr_token>`, never the object number
(§9.2). An object whose `qr_token` is still `NULL` prints without a QR and shows
`object:sticker.noToken` instead of a broken code.

**Formats.** A6 (105 × 148 mm) — one sticker per page; A4 (210 × 297 mm) — four A6
stickers per page in a 2 × 2 grid. The selected format writes one `@page` rule
(`size` and `margin`); the sheet grid sizes the cards, every card is
`break-inside: avoid`, and screen preview and print use the same millimetre sizes.
The app chrome (header, navigation, toolbar) is `print:hidden`; print colours are
black on white. No print-dialog automation and no PDF endpoint.

### 9.4 CSV import (planned)

Upload, column mapping, preview and upsert by `object_no` stay in `PLAN.md` §11
until their work package exists.

### 9.5 REST API for external systems (planned)

API keys, scopes, `PUT /objects/{object_no}`, bulk upsert, webhooks and OpenAPI
stay in `PLAN.md` §11 (phase 10) until their work package exists.
