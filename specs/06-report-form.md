# 07 — Report form

**Chapter:** 7
**Scope:** ~150 lines; filled for WP-M2-04, WP-M2-04b and WP-M2-04c
**Status:** taken from `PLAN.md` §2 (112 notice), §10 (report form and offline),
§6 (ticket fields) and §15 (NFR: magic bytes, token entropy, rate limits) and
reviewed with the product owner on 2026-10-31. Three points were **decided then**,
because `PLAN.md` left them open: the `ticket_no` format is
`ST-<year>-<counter>` (§7.3.1), the photos of a report travel as base64 data URLs
in the JSON body (§7.4), and `status_token` is generated **when the ticket is
created**, not in WP-M2-06 (§7.3.4).

> Tables and columns of this chapter are specified in
> [`02-data-model.md`](02-data-model.md) §4.8–§4.11; this slice specifies the
> fields, the public endpoint and the behaviour.

## 7.1 Safety notice

The report form and every printed QR sticker must show:

> **Bei Brand oder Gefahr: Notruf 112. Dieses Formular ersetzt keinen Notruf.**

The English locale carries the same meaning. StörDesk accepts malfunction
reports only; it is never an emergency call path. No other emergency number is
part of the product text. **(plan, §2)**

## 7.2 Fields of the form

| Field         | Rule                                                                                                                                     | Source     |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| object        | prefilled from the QR token, searchable in the internal form; a QR report always reports on exactly one object                           | plan §10   |
| system        | optional, prefilled when the QR belongs to a `systems` row; must belong to that object                                                   | plan §10   |
| fault type    | multi-select of the localized standard templates (`text_templates.key`, §4.5) **and/or** free text — at least one of the two is required | plan §10   |
| free text     | `description`, max. 4000 characters                                                                                                      | this slice |
| photos        | up to 6, compressed client-side to max. 1600 px and JPEG quality 0.8                                                                     | plan §10   |
| contact       | name optional, **phone or e-mail required** (at least one)                                                                               | plan §10   |
| priority      | internal reports only; QR reports are always `normal`                                                                                    | plan §10   |
| locale        | `de`/`en` of the reporter — used for later notifications, stored in the `created` event payload, never as a column label                 | plan §3    |
| `client_uuid` | client-generated UUID, the idempotency key of offline replay                                                                             | plan §10   |

The 112 notice of §7.1 sits above the send button; a privacy notice (§15) sits
next to the contact fields. Both are i18n keys, never literals.

## 7.3 Public create endpoint (WP-M2-04b)

`POST /api/v1/public/tickets` — **no authentication**. The QR token travels in
the body, never in the URL of a write request. The caller resolves the token
first through `GET /api/v1/public/qr/:token` (`08-objects-api.md` §9.2), so the
form always submits the **current** token; a retired token in this body is a
plain `404`.

### 7.3.1 Request

| Field               | Type / rule                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------ |
| `qrToken`           | 22 URL-safe characters, required; resolves to an **active** object                         |
| `clientUuid`        | UUID, required, unique over all tickets (§7.3.3)                                           |
| `text`              | trimmed, max. 4000 chars, optional                                                         |
| `faultTemplateKeys` | array of `text_templates.key`, max. 9, no duplicates, optional                             |
| `systemId`          | UUID, optional, must belong to the resolved object                                         |
| `contact.name`      | trimmed, max. 120, optional                                                                |
| `contact.phone`     | trimmed, max. 60, optional                                                                 |
| `contact.email`     | valid e-mail, max. 320, optional                                                           |
| `reportedAt`        | ISO-8601 timestamp with offset, optional — the device capture time, default server `now()` |
| `locale`            | `de` \| `en`, default `de`                                                                 |
| `photos`            | array of base64 data URLs, max. 6 — WP-M2-04c, see §7.4                                    |

Validation answers `400 invalid_request` with `{ fields: [...] }` (the same
envelope as the rest of the API, `PLAN.md` §3).

### 7.3.2 Responses

- `201` — `PublicReportResponse`: `ticketId`, `ticketNo`, `status: "NEW"`,
  `statusToken`, `reportedAt`, `receivedAt`, `deadlineAt`, `clockSkewed`, `photoCount`
- `200` — the same body of the **existing** ticket on an idempotent repeat
- `400 invalid_request` — body outside the schema of §7.3.1
- `404 qr_token_not_found` — unknown, retired or inactive token
- `422 report_text_required` — neither `text` nor `faultTemplateKeys`
- `422 contact_required` — neither `contact.phone` nor `contact.email`
- `422 system_not_found` — `systemId` is not a system of the resolved object

`ticketNo` is generated in the database (§4.11): `ST-<year>-<counter>`, counter
padded to four digits, one counter row per year, allocated by an
`INSERT … ON CONFLICT DO UPDATE` — concurrency-safe, gaps allowed after a rolled
back transaction because the number is not a legal invoice number.

### 7.3.3 Idempotency

`client_uuid` carries a unique index. A second request with the same
`client_uuid` **does not create a second ticket**: the service inserts with
`ON CONFLICT DO NOTHING`, and when nothing was inserted it reads and returns the
existing ticket with `200`. A concurrent double submit is caught by the unique
violation and answers `200` the same way. This is the contract the offline outbox
of WP-M2-09 replays against (`PLAN.md` §10, acceptance 20.2).

### 7.3.4 Server time, deadline and status token

- `received_at` is server time and always `now()`.
- `reported_at` is the device capture time, **unless** it differs from server
  time by more than **10 minutes** in either direction; then the server keeps
  `reported_at = received_at` and sets `tickets.clock_skewed = true`. **(plan §10)**
- `deadline_at = (clock_skewed ? received_at : reported_at) + 72 h`. Per-priority
  deadlines and the pg-boss timers arrive in phase 6 (`PLAN.md` §9); until then
  the constant is the default of §9.
- `status_token` (22 URL-safe random characters, unique) is generated **with the
  ticket**, so the confirmation page of WP-M2-05 can already render the link to
  `/s/<status_token>`. WP-M2-06 adds only the public status API and UI.

## 7.4 Photos (WP-M2-04c)

- Transport: `photos: string[]` of data URLs (`data:image/jpeg;base64,…`) in the
  same JSON body — the canvas output of the client compressor needs no extra
  round trip and adds no dependency. The route raises its `bodyLimit` to
  `6 × UPLOAD_MAX_BYTES` plus base64 headroom.
- Limits: at most **6** photos, at most `UPLOAD_MAX_BYTES` (default 10 MB) per
  **decoded** photo → `422 photo_limit_exceeded` / `422 photo_too_large`.
- Content check on the server: magic bytes, accepted types `image/jpeg`
  (`FF D8 FF`) and `image/png` (`89 50 4E 47 0D 0A 1A 0A`); a body whose MIME
  claim and bytes disagree is `422 photo_type_unsupported` and **no** photo of
  that request is stored. **(plan §15)**
- Storage: `<UPLOAD_DIR>/tickets/<ticketId>/<photoId>.<ext>` on the uploads
  volume; `ticket_photos` carries the relative path, MIME type and byte count
  (§4.10). The directory is never served directly — access is authenticated or
  signed (phase 10), the file name is a UUID, never the object number. **(plan §15)**
- The photos of an idempotent repeat are **not** stored twice: the repeat
  returns the existing ticket and ignores its photo array.

## 7.5 What one report writes

In one transaction: one `tickets` row (`status = 'NEW'`, `source = 'QR'`,
`priority = 'normal'`, reporter contact, `fault_template_keys`, `description`,
`client_uuid`, `status_token`, `ticket_no` by §4.11) and one append-only
`ticket_events` row `type = 'created'` with
`actor_kind = 'public'`, `actor_user_id = NULL` and
`payload = { locale, source, faultTemplateKeys, textLength }` — the event payload
carries the submission details, so no extra columns are invented.

`PLAN.md` §7 rule 1 also demands the office notification. That runs through the
outbox of **phase 7** (`PLAN.md` §12) and is deliberately not part of this
package; the `created` event is the hook it will attach to.

## 7.6 Rate limit and spam (WP-M2-07)

The rate limit of `PLAN.md` §10 (per IP **and** per QR token) and the honeypot
are spam protection, not the create path, and are implemented by the existing
**WP-M2-07**, which also defines "suspicious" (> 3 reports per 10 minutes per IP
or token) and sets `tickets.suspected_spam` without dropping the report. Until
then only the global `RATE_LIMIT_MAX` of `@fastify/rate-limit` protects the
route; the column `suspected_spam` already exists so phase 2 stays upward
compatible.

## 7.7 Later packages of this chapter

The duplicate hint (`GET /api/v1/public/tickets/open?…`, `parent_ticket_id`) is
WP-M2-08, the form itself WP-M2-05, the status page WP-M2-06, the offline outbox
WP-M2-09.
