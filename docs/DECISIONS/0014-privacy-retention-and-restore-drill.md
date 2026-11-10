# ADR-0014: Privacy retention and the restore drill

- Status: accepted
- Date: 2026-11-10
- Stakeholders: data protection, administration, operations

## Context

`PLAN.md` §15 requires configurable retention (contact data and photos 24 months
after closing), export and deletion of personal data by an admin, a documented
restore procedure and a backup of database and uploads. Phase 2 left two
retention questions open: `report_throttle.ip` (WP-M2-07) and
`bma_sync_runs.conflicts` (WP-M2-32 record). The backups currently dump only the
database; the uploads volume has no periodic backup.

## Decision

1. **Defaults from the plan, values configurable.** Retention settings are
   `privacy.contact_retention_months` and `privacy.photo_retention_months`, both
   defaulting to `24`. A daily `privacy-retention` job anonymises contact fields
   of closed tickets and deletes photos after the window. The action is
   idempotent, batched and logged as aggregate counters only.
2. **Short-lived throttle data.** `report_throttle` rows are deleted after 30
   days. The IP exists only for the spam window and is never part of a ticket.
3. **BMA sync history.** `bma_sync_runs` rows are deleted after 365 days.
   `conflicts` carries object names, not reporter personal data, so a one-year
   history is kept for operations.
4. **Export and erasure touch personal data only.** The admin export returns the
   reporter contact fields, photos and events. Erasure sets the contact fields to
   `NULL` and appends one `personal_data_erased` event; it never deletes the
   ticket automatically. Full deletion remains the `ticket.delete` path.
5. **Backups include uploads.** The optional `backup` profile writes the periodic
   database dump and an uploads archive. The restore procedure covers both.
6. **A restore drill proves the backup.** The drill creates a throwaway source
   database, writes a dump and an uploads archive, restores them into fresh
   targets, and compares row counts and the photo manifest. It runs in the Docker
   CI job; without Docker it is reported as unverified, never green.

## Alternatives

- **Delete tickets with their contact data** — rejected: the ticket history is
  the operational record; only the personal data is removed.
- **Keep throttle IPs for the ticket lifetime** — rejected: data minimisation;
  the throttle window is minutes, not months.
- **Encrypt dumps inside the backup volume** — deferred: there is no key
  management contract yet; the volume protection and retention window stay the
  documented boundary.
- **A manual restore checklist only** — rejected: the exit criterion requires a
  passing drill.

## Consequences

- The backup profile needs write access to the uploads volume.
- The restore procedure must restore database and uploads together; a
  photo row without its file is a broken ticket gallery.
- The retention job is a scheduled process and must be started only by the direct
  API start, like the other pg-boss jobs.
