# 14 — Non-functional requirements (chapter 15)

**Chapter:** 15
**Scope:** security, privacy, retention, availability, restore, performance,
maintainability, time and audit
**Status:** filled from `PLAN.md` §15 and reviewed for WP-M10-01

> The binding summary stays `PLAN.md` §15. This slice adds the phase-10 details
> for privacy retention, personal-data export/erasure and the backup/restore
> contract. Values marked **(plan)** come from `PLAN.md`.

## 15.1 Security

- TLS is terminated by the external proxy; HSTS and a restrictive CSP are set by
  the web container. Cookie authentication uses CSRF protection.
- Passwords are hashed with Argon2id. Login and public endpoints carry rate
  limits; the report route keeps its per-IP and per-QR-token window **(plan)**.
- Uploads are checked by magic bytes (`image/jpeg`, `image/png`) and capped at
  `UPLOAD_MAX_BYTES` (default 10 MB) after decoding. The uploads volume is never
  served directly; photos go through `GET /api/v1/tickets/:ticketNo/photos/:photoId`
  with `ticket.photo.read`.
- QR and status tokens carry at least 128 bits of randomness (22 base64url
  characters). API keys carry 256 bits, are stored only as SHA-256 hashes and are
  shown once (`specs/08-objects-api.md` §9.5).
- Webhooks are signed with HMAC-SHA256 over `<timestamp>.<body>`; secrets are
  never returned after creation and never written to logs.
- No secret, token, password, e-mail address or phone number appears in a log
  line, a commit message or a fixture.

## 15.2 Privacy

- Data minimisation for anonymous reporters: contact fields are optional where
  the workflow allows it, and no contact data is required for a QR report
  beyond the report contract of `specs/06-report-form.md`.
- The report form shows the privacy notice next to the send button.
- No plaintext contact data in logs.
- Data hosting is Germany/EU.

### Retention (WP-M10-15)

The retention window is configurable in the administration and defaults to the
`PLAN.md` §15 values. The settings keys are
`privacy.contact_retention_months` (default `24`) and
`privacy.photo_retention_months` (default `24`).

A daily pg-boss job `privacy-retention` runs at 03:30 server time:

1. **Reporter contact data** — for tickets whose `closed_at` is at or before
   `now - contact_retention_months`, `reporter_name`, `reporter_phone` and
   `reporter_email` become `NULL`. The ticket, its events and its statistics
   stay. The action is idempotent and never edits an append-only event row.
2. **Photos** — for photo rows whose ticket `closed_at` is at or before
   `now - photo_retention_months`, the file below `UPLOAD_DIR` is deleted and the
   `ticket_photos` row is removed. A missing file is not an error.
3. **Throttle data** — `report_throttle` rows older than 30 days are deleted.
   The IP is kept only for the short spam window and is never needed for a
   ticket. This settles the open question of WP-M2-07.
4. **BMA sync history** — `bma_sync_runs` rows older than 365 days are deleted.
   `conflicts` payloads stay until then; they contain object names, never
   reporter contact data. This settles the open question of the WP-M2-32 record.

The job logs only aggregate counters (`anonymized`, `photosDeleted`,
`throttleDeleted`, `syncRunsDeleted`), never a ticket number or a contact value.

### Export and erasure (WP-M10-16)

An admin with `user.write` can export or erase the personal data of one ticket:

- `GET /api/v1/privacy/tickets/:ticketNo/export` answers
  `{ ticketNo, reporter, photos, events }` without internal notes of other users
  and without the status token.
- `POST /api/v1/privacy/tickets/:ticketNo/erase` requires a `reason` (5–1000
  characters), anonymises the reporter contact data immediately and appends one
  `personal_data_erased` event with the reason length and the actor. It is
  idempotent: a repeat answers `200` and writes no second event.
- Neither route deletes the ticket or its audit trail. A full ticket deletion
  stays the existing `ticket.delete` path (`PLAN.md` §7 rule 10).

## 15.3 Availability and operations

- Daily `pg_dump` of the database and a backup of the uploads volume
  (`backups` volume, `BACKUP_RETENTION_DAYS`, default 14 days).
- A documented restore procedure for database and uploads
  (`docs/DEPLOYMENT.md`).
- A restore drill (WP-M10-17) proves on a throwaway database that a dump and an
  uploads archive restore to the same row counts and photo manifest. The drill
  runs in the Docker CI job; without Docker it is reported as unverified.
- Health endpoints: `GET /api/v1/health` and `GET /healthz` of the web container.
- Structured logs at `API_LOG_LEVEL`, JSON in production.

## 15.4 Performance

- The report form is interactive within 2 s on a mid-range phone over 4G.
- The ticket list is paginated and stays usable with 50,000 tickets.
- The daily retention job processes in bounded batches of 500 rows per table so
  it never locks the ticket table for a long transaction.
- External API list endpoints cap `limit` at 1000 and use `updated_at` indexes.

## 15.5 Maintainability

- Versioned migrations under `apps/api/src/db/migrations`.
- Complete `.env.example`.
- ESLint and Prettier; `npm run check` green after every WP.
- `docs/REPO-MAP.md` updated after every WP.
- OpenAPI reflects the external contracts from the shared Zod schemas.

## 15.6 Time

- Server times are UTC.
- Display and on-call calculations use `Europe/Berlin`.
- DST tests cover March and October.

## 15.7 Audit

- `ticket_events` and `oncall_events` are append-only; database triggers block
  `UPDATE` and `DELETE`.
- API-key actions on tickets are recorded as `actor_kind = 'system'` with the
  key id in the payload, never the token.
- Privacy erasure is itself an audit event and cannot be edited afterwards.
