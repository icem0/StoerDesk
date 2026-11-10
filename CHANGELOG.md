# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- External requests can authenticate with `Authorization: Bearer sk_...` (WP-M10-05): `apiKeyPlugin` verifies the hashed key, rejects malformed, revoked and expired keys with `401 api_key_invalid`, and the dual guard `requireScopeOrPermission` accepts a session permission or an API-key scope while a key without its scope gets `403 forbidden`.
- The admin page `/admin/api-keys` lists, creates and revokes external API keys (WP-M10-04): scope checkboxes, optional expiry, the plaintext token shown exactly once with a dismiss action, and read-only mode without `apikey.write`.
- Phase 10 (API and hardening) is split and started (WP-M10-01): `specs/08-objects-api.md`
  now defines CSV object import (§9.4) and the external REST API (§9.5) — bearer API keys
  with the four scopes `objects:read`, `objects:write`, `tickets:read`, `tickets:write`,
  object upsert/bulk/updated-since, external ticket creation and work-order updates,
  HMAC-signed webhooks with five backoff retries and OpenAPI under `/api/docs`.
  `specs/14-nfr.md` defines the privacy retention (contact data and photos 24 months after
  closing, throttle rows 30 days, BMA sync history 365 days), personal-data export and
  erasure, the uploads backup and the restore drill. ADR-0013 and ADR-0014 record the
  decisions; the phase is split into WP-M10-02 … WP-M10-18.
- Phase 9 (dashboard and statistics) is complete (WP-M9-01 … WP-M9-18): the live
  dashboard at `/` reads one snapshot (`GET /api/v1/dashboard`) and updates through the
  authenticated SSE stream (`/api/v1/dashboard/stream`, 30-second refetch fallback) with
  the fault-free counter and record, the open/overdue/unreviewed/pool tiles, the on-call
  and channel tiles; the token-protected wall display `/tv/:token` polls every 15 seconds
  without a session and never renders contact data; `/admin/dashboard` rotates the TV
  token, toggles anonymisation and sets the conspicuous threshold; the statistics page
  `/stats` filters by range and dimensions in the URL and renders reaction times, an
  inline-SVG frequency series, the three groupings, top objects with the conspicuous
  marker and the compliance and decline cards; `/api/v1/stats/*` answers the JSON sections
  and `/api/v1/stats/export.csv` streams the semicolon-separated export under `stats.export`.
  The exit criterion (counter reset on a new report, ignored test/cancelled tickets and the
  printed reaction-time median) is proven by `phase9-exit.integration.spec.ts`.

### Changed

- The object list lost its external indicator (record WP-M9-26 — the commit `d1e34eb`
  landed without a work package): the rows no longer carry the "extern gepflegt" badge of
  WP-M2-39 next to the object number and the `Typ` column of WP-M2-66 (header, cells and the
  `externalTypeCategory` import) is gone, so the list shows object number, name, address,
  active badge and the edit/delete actions as a flex row side by side. The keys
  `list.externalBadge`, `list.externalHint` and `list.columns.type` were deleted in `de` and
  `en`. Nothing else changed: the API still answers `externalId` and `externalType`, the BMAcloud
  sync still writes them and the object detail still carries the external information — the
  list simply stopped presenting them. The record also corrects the off-by-one WP references
  in the `branding-state.ts` module comment (internal creation gate WP-M9-25, ticket view
  gate WP-M9-24).

- The branding title switch has one reading point (WP-M9-23): the `titleEnabled`
  flag of the branding row was read four times with four copies of the same rule.
  `apps/api/src/settings/branding-state.ts` exports `readTitleEnabled` (the row
  read), `parseTitleEnabled` (the value rule) and the `BRANDING_KEY` constant;
  the branding route, the public QR resolve, the public report and the internal
  creation read the flag through it. A missing or malformed row still means
  `false`, so the behaviour is unchanged.

### Fixed

- The dashboard stream no longer drops a change that arrives while a client reacts to the
  first snapshot (WP-M9-39): `GET /api/v1/dashboard/stream` sent its first snapshot **before**
  it captured the probe baseline. A client that reacts to the snapshot — the integration test
  inserts a ticket right away — could commit its change before the baseline query read the
  table, and the baseline then already contained it. The probe saw no difference and sent no
  second snapshot, so the client waited for a snapshot that never came. The window is one
  database round trip: on a developer machine it is a millisecond, on a loaded CI runner it
  grew past the five-second test budget and the run failed with a timeout in
  `dashboardStream.integration.spec.ts` while the rest of the suite passed. The baseline is
  now captured before the first snapshot, so every change that arrives after the baseline is
  visible to the probe; a change between the baseline and the snapshot is delivered twice,
  which the client ignores.

### Added

- The statistics services of the phase 9 read the tickets and answer the reaction times and
  the frequency (WP-M9-10): `apps/api/src/stats/filters.ts` turns the shared statistics filter
  into a SQL predicate over the `stats_tickets` view — the local days `from` … `to` of
  `Europe/Berlin` become UTC instants with `date-fns-tz`, so a DST day keeps its real length,
  `objectNo` matches case-insensitively, `systemType`, `priority` and `technician` match
  exactly, and test and suspected-spam tickets stay excluded unless the caller opts in.
  `apps/api/src/stats/reaction-times.ts` computes one aggregate per phase (`review`,
  `firstResponse`, `acknowledge`) with the count, the median, the average and the p90 in whole
  minutes, and reports the paused tickets and the pause minutes next to the phases without
  subtracting them (ADR-0012 decision 8). `apps/api/src/stats/frequency.ts` answers the bucket
  series (`day`, `week`, `month` — a week starts on Monday) on the Berlin local date of
  `reported_at`; an empty bucket is answered with `total: 0`, so the chart has a continuous
  axis, and the `bySystemType`, `byFaultTemplate` and `bySource` groupings count the same
  filtered set. The routes, the CSV export and the statistics page follow in WP-M9-11 and
  WP-M9-12.

- The internal creation form honours the branding title switch (WP-M9-25): the form reads
  `GET /api/v1/settings/title-switch` before it renders and shows its title field only while
  `titleEnabled` is on, so the office never fills in a title the installation does not keep;
  a missing, pending or failed answer means off, and the title travels in the submit body only
  while the switch is on (the server already drops it — WP-M2-95).

- The ticket view honours the branding title switch (WP-M9-24): `GET /api/v1/tickets/:ticketNo` answers `title: null` while `titleEnabled` is off, so the ticket detail view and the branded e-mail view show no title; the stored title stays in the database and reappears when the switch is turned back on. `GET /api/v1/settings/title-switch` (guarded by `ticket.create`) lets the internal creation form learn the switch before it renders its title field; all reads share `readTitleEnabled` from `apps/api/src/settings/branding-state.ts` (WP-M9-23).

- The ticket purge log is append-only (WP-M9-27, audit SEC-013): migration `0024_ticket_purges_append_only` adds triggers to `ticket_purges` — any `UPDATE`/`DELETE` raises `ticket_purges_append_only`, and an inserted `reason` longer than 1000 characters raises `ticket_purges_reason_too_long`.

- Ticket and object search match literally now (WP-M9-28, SEC-012): both searches escape `\`, `%` and `_` through one shared helper (`escapeLikePattern`), so a search string is matched exactly instead of widening the result set (the ticket list search had fixed `%`/`_` — the object search had inherited the same drift).

- Ticket numbers are validated at the entry points (WP-M9-29, SEC-015): `GET /api/v1/tickets/:ticketNo` and the two comment routes reject a malformed `ticketNo` (`ST-<year>-<counter>`) with `400 invalid_request` before touching the database.

- Workflow, delete, photo and comment routes are hardened (WP-M9-30): the decline reason is capped at 1000 characters, decline requires `ticket.decline` (not `ticket.accept`), `ticketNo` is validated at every path parameter, `delete` no longer leaks the raw PostgreSQL message, photo serve is permission-gated with a containment check and `Cache-Control: private, no-store`.

- A report with an invalid photo array no longer leaves an orphan ticket behind (WP-M9-31, SEC-014): `validateReportPhotos` runs count, data-URL prefix, decoded size and magic-byte checks before the ticket transaction; a repeat keeps its old gallery and is not re-validated.

- The branding logo is byte-checked now (WP-M9-32, SEC-019): `validateLogo` reuses `detectImageType` and rejects any `data:image/png`/`data:image/jpeg` payload whose magic bytes disagree with the claim, so arbitrary bytes no longer land in the settings jsonb.

- The iCal feed expires and rechecks (WP-M9-33, SEC-005/SEC-011): the HMAC of the capability token is salted with a rolling 1-year bucket so an abandoned URL expires within ~2 years; the route filters `users.active = true` and re-checks `PERMISSIONS.oncall.read` on every request; `Cache-Control: no-store` and a raised route `logLevel` keep the token out of the JSON file log, `docker logs` and browser/proxy caches.

- `SESSION_SECRET` needs 32 characters (WP-M9-34, SEC-016) and logout requires the session cookie (SEC-006): the env schema adds `.min(32)` (the 37-char dev default still passes), and the logout route only calls `destroySession` when the `SESSION_COOKIE_NAME` cookie is present, so a cross-site POST (which browsers strip cookies for under SameSite) can no longer force a logout.

- The dead `prefix: '/api/v1/oncall'` option on the on-call pools plugin is gone (WP-M9-35, SEC-010): `fastify-plugin` skip-override ignored it, so the option was misleading dead code that would have doubled the prefix if the plugin ever became encapsulating.

- The public comment route is bounded (WP-M9-36, SEC-004, API side): the schema requires the ticket's `statusToken` and a fresh `clientUuid` per submission; the service rejects a comment whose `statusToken` disagrees with the stored one with `403 comment_status_token_mismatch`, replays the same `clientUuid` via `internal_action_receipts` and runs the report spam throttle (suspicious comments are tagged with `suspected_spam: true` in the event payload).

- The web comment path now carries the report spam contract (WP-M9-37, SEC-004 web side): the comment POST body adds `clientUuid`, `website`, `verification` and the reporter's own `statusToken`; `handledErrorCodes` grows `comment_status_token_mismatch` so the form shows the API notice instead of an unhandled error page.

- BMAcloud credentials GET now needs `object.import` (WP-M9-38, SEC-009): the route used to be readable by every role with `object.read` (reporter_internal, office, oncall, manager), which exposed the metadata of "is the API key set and where does it come from"; the admin-side PUT/DELETE already required `object.import`, so the GET now matches.

- The ticket data model gains the test-data flag (WP-M9-02): migration `0023_ticket_is_test`
  adds `tickets.is_test` as a not-null boolean with default `false`, plus the partial
  `tickets_is_test_reported_at_idx` index for `is_test = false`. Drizzle declares the
  column as `isTest`, and the ticket-table integration test proves that default inserts
  are real data, explicit test data survives, and `NULL` is rejected.

- The dashboard snapshot service lands (WP-M9-05): `apps/api/src/dashboard/service.ts`
  computes the dashboard snapshot — fault-free counter and record, the open/per-status/
  overdue/unreviewed/pool-size tiles, the on-call tile (name, shift end, warning) and the
  per-channel outbox status (last sent/failed, pending/failed), plus the ten nearest
  burning-now deadlines. Every read goes through the `stats_tickets` view, `outbox` or
  the on-call coupling, never a ticket detail; optional sections (`onCall`, `channels`)
  are `null` when the caller lacks the permission. Covered by an integration test against
  a throwaway database (`dashboardService.integration.spec.ts`, skips without
  `TEST_DATABASE_URL`).

- The dashboard of the office ends with its tiles (WP-M9-19): the "Brennt jetzt" list is
  gone from the start page — the wall display of phase 9 keeps it
  (`specs/11-dashboard.md` §11.5) — and every tile ("Meldungen gesamt", "offen",
  "überfällig", "ohne Prüfung") is one link over its whole area instead of a link on the
  text only. The pending and the failed state of the four count queries stays visible
  below the tiles.

- Phase 9 (dashboard and statistics) is split and started (WP-M9-01): `specs/11-dashboard.md`
  and `specs/12-stats.md` carry the reviewed contract of the live dashboard, the wall display
  `/tv/:token` and the statistics slices with their API shapes and boundaries. ADR-0012
  settles the phase-9 decisions: SSE instead of a five-second polling probe, plain SQL views
  instead of materialized views, a computed fault-free record, a stored rotatable TV token,
  `tickets.is_test` for test data, inline SVG charts and `stats.conspicuous_threshold`. The
  phase is split into WP-M9-02 … WP-M9-18 in `work-packages/m9/`, implemented in numeric
  order; the exit criterion is the test flag, the counter reset and the reference data of
  WP-M9-18. No product code in this commit.

- The phase-8 exit criterion (WP-M8-16): the new integration test
  `apps/api/src/oncall/__tests__/phase8-exit.integration.spec.ts` proves the DST
  rule of the slot generator (167 h in the spring week of 2026-03-23, 169 h in the
  autumn week of 2026-10-19, 168 h in a neutral week) and the atomic swap rule of
  `specs/04-oncall.md` §4a.5 — two concurrent acceptances of one `PENDING` request
  yield exactly one winner, one acceptance event and a `409` for the loser, with the
  shift carrying the winner after approval (approval on) or immediately (approval
  off). Phase 8 is complete.

- Offline on-call shift confirm and decline (WP-M8-15): the web outbox gains a
  Dexie v3 `shift_actions` table keyed by `client_uuid`. `useShiftActions(shiftId)`
  tries the online route first and, while the browser is offline, queues the write
  for replay on app start and `online`; the decline reason is validated before it
  is queued. The my-shifts page shows the queued/failed/rejected state on the shift
  card with retry and, for server rejections such as `oncall_shift_started`, discard.

- The personal on-call iCal feed (WP-M8-12): `GET /api/v1/oncall/ical/:token.ics` is
  public and answers the `PLANNED` and `CONFIRMED` shifts of one user from 30 days ago
  to 180 days ahead as an RFC 5545 calendar with UTC `DTSTART`/`DTEND`, stable UIDs and
  escaped text. The token is the stateless HMAC of ADR-0011 and is verified with a
  timing-safe comparison; any malformed, forged or unknown-user token answers
  `404 ical_not_found`. `SUMMARY`/`DESCRIPTION` come from the user's server locale.

- On-call ticket coupling and warnings (WP-M8-10): `POST /api/v1/tickets/:ticketNo/offer`
  now resolves the on-call person of the default pool in one transaction — a `CONFIRMED`
  (or `SWAP_REQUESTED`) shift wins over a `PLANNED` one and sets `offered_to_user_id` plus
  `offer_escalated_at`; an unstaffed slot clears both and returns the `oncall_unstaffed`
  warning. The `offered` event carries `onCall`, `shiftId`, `poolId` and an optional
  `warning`, and the route accepts an optional `poolId`. `GET /api/v1/oncall/warnings`
  (`oncall.read`) lists unstaffed shifts inside `oncall.unfilled_warning_days` and
  `PLANNED` shifts starting within `oncall.reminder_unconfirmed_h` next to the default
  pool. Offer timeout and group escalation stay in WP-M8-11.

- The deadline administration (WP-M6-14, WP-M6-14b, WP-M6-15, WP-M6-16): the four deadline
  hours per priority and the reaction minutes (standard and critical) of the escalation rules
  are editable at `/admin/deadlines`, backed by `GET/PUT /api/v1/settings/deadlines`. The menu
  entry "Fristen" of the administration is now available. Per-object-type deadlines are not
  implemented; no spec defines them yet.

- Phase 8 (on-call calendar) is split and started (WP-M8-01): `specs/04-oncall.md` now
  carries the reviewed contract for pools, local-time weekly slots, the six shift states,
  confirm/decline, swap requests, ticket coupling, warnings and the personal iCal feed.
  ADR-0011 settles the open swap-approval decision (default `true`, atomic first
  acceptance, original technician responsible until approval) plus local wall-clock weeks
  in `Europe/Berlin`, group-based pool membership, `oncall.default_pool_id` and the
  stateless HMAC iCal token. The phase is split into WP-M8-02 … WP-M8-16 in
  `work-packages/m8/`, implemented in numeric order; the exit criterion is the DST and
  atomic-swap test of WP-M8-16. No product code in this commit.

- The on-call schema lands with migration `0020_oncall_tables` (WP-M8-02):
  `oncall_pools` (unique case-insensitive trimmed name, optional `group_id` with
  `ON DELETE SET NULL`), `oncall_shifts` (range index on
  `(pool_id, starts_at, ends_at)`, unique `(pool_id, starts_at)`, six-state check,
  `ends_at > starts_at`), `oncall_swap_requests` (partial unique `PENDING` per
  shift) and append-only `oncall_events` with a unique nullable `client_uuid` for
  idempotent confirm/decline replays. The `oncall_event_append_only` trigger
  blocks `UPDATE` and direct `DELETE`; the `ON DELETE CASCADE` of a shift still
  passes (`stoerdesk.allow_oncall_event_delete` session bypass, like ticket
  hard-delete). Covered by
  `apps/api/src/db/__tests__/oncallTables.integration.spec.ts`.

- The Web Push channel sends notifications to installed PWAs (WP-M7-09): `apps/api/src/notifications/channels/web-push.ts`
  is the sixth channel adapter of the phase-7 chain and delivers `${title}\n${body}` plus the
  `\n\n<label>: <pwaUrl>` deep link labelled `t(locale, 'notification.action_label')` through the
  `web-push` library (ADR-0010 — encrypted payloads and VAPID JWT signing are not hand-written
  locally). `WebPushConfig` reads `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` — configured
  only when all three are set — `sendWebPushNotification` throws `WebPushError('no_keys')` without
  keys and wraps transport failures as `send_failed`, never leaking the endpoint, the keys or the
  private key; an empty subscription list is a successful no-op. The chain entry in
  `channels/index.ts` reads the `push_subscriptions` rows of WP-M2-95 (endpoint, p256dh, auth) over
  a short-lived database pool, so the escalation chain of WP-M7-05 is now signal → matrix → ntfy →
  email → telegram → webpush. PWA push registration (subscribe in the web app, `notification_permissions`
  and the admin failure warning of §12), per-event channel selection and `pushUrl` as an escalation
  parameter stay unimplemented.

- The Telegram channel sends notifications over the Telegram Bot API (WP-M7-08): `apps/api/src/notifications/channels/telegram.ts`
  is the fifth channel adapter of the phase-7 chain and posts the notification as JSON (`chat_id`,
  `text`) to `sendMessage` of an existing bot with plain `fetch` — no library, no ADR, the transport
  of ntfy and Matrix. It keeps the adapter shape of WP-M7-07 — `TelegramConfig` from the existing
  `TELEGRAM_*` keys, `TelegramError` with the codes `no_token` (no request) and `http_error` (status
  only, never the token), `fetch` as its injectable last parameter — and the message content of
  WP-M7-04: `${title}\n${body}` plus a `\n\n<label>: <pwaUrl>` deep link labelled
  `t(locale, 'notification.action_label')` while a PWA url exists, never a photo, never contact
  data. `configuredChannels(env)` gained the `telegram` entry (configured when `TELEGRAM_BOT_TOKEN`
  and `TELEGRAM_CHAT_ID` are both set, appended last), so the escalation chain of WP-M7-05 is now
  signal → matrix → ntfy → email → telegram; `drainOutbox`, `escalationChain` and migration `0019`
  needed no change. Telegram account linking via a one-time code and Web Push (VAPID) keep their
  own WPs.

- The CI pipeline is hardened (WP-M1-28). `.husky/pre-push` refuses a push with more
  than three tags, because GitHub creates no tag push event for such a batch, and
  `AGENTS.md` now requires a push after every work package. The `promote` job of
  `build.yml` runs only after a successful `publish`, so a failed image build cannot
  split `latest`. A new `deploy` job runs after `promote`, only for the highest
  `v[0-9]*` tag, and calls `DEPLOY_WEBHOOK_URL` with `X-Signature-256` and
  `X-Deploy-Token`; a missing target is a skipped notice. `docs/DEPLOYMENT.md`
  documents both secrets and the payload. The `docker-smoke` job now fails when the
  runner has no usable Docker instead of skipping silently.

- A database dump is forced before the API applies pending migrations (WP-M3-17):
  `docker-compose.yml` gained the one-shot `db-backup-pre-migrate` service. It has no
  profile, writes and verifies `/backups/pre-migrate-<stamp>.sql.gz` in the backup
  volume and `api` depends on it with `condition: service_completed_successfully`, so a
  failed or empty dump stops the deployment before any migration runs. A broken
  migration therefore never reaches the database without a fresh dump. The dump lives
  in the existing backup volume and `BACKUP_RETENTION_DAYS` also bounds these copies;
  the periodic `backup` profile service is unchanged. `README.md`, `docs/DEPLOYMENT.md`
  and `.env.example` document the gate. The Docker commands remain unverified in the
  development container (no Docker daemon).

- The e-mail channel sends notifications over SMTP (WP-M7-07): `apps/api/src/notifications/channels/email.ts`
  is the fourth channel adapter of the phase-7 chain and talks to an existing mail server through
  `nodemailer` (ADR-0009 — the plan fixed no SMTP library and the `SMTP_PORT=587` default needs a
  STARTTLS upgrade Node cannot express). It keeps the adapter shape of WP-M7-01 — `EmailConfig`
  from the existing `SMTP_*` keys (`user`/`password` become an `auth` block only when a user is set),
  `EmailError` with the codes `no_sender` and `send_failed`, the transport factory as its injectable
  last parameter — and the message content of WP-M7-04: ticket number as subject, priority and object
  name as body, plus a `\n\n<label>: <pwaUrl>` deep link labelled `t(locale, 'notification.action_label')`
  while a PWA url exists, never a photo, never contact data. `configuredChannels(env)` gained the
  `email` entry (configured when `SMTP_HOST` and `SMTP_FROM` are both set, appended last), so the
  escalation chain of WP-M7-05 is now signal → matrix → ntfy → email and an exhausted row of ntfy
  falls back to e-mail; `drainOutbox`, `escalationChain` and migration `0019` needed no change.
  Telegram and Web Push keep their own WPs, and so do the per-event-type channel choice and the
  mandatory minimum channel for `critical`.

- The phase-7 exit criterion is proven (WP-M7-06): `apps/api/src/notifications/__tests__/notification-exit.integration.spec.ts`
  runs the real API on a throwaway database — a ticket whose only outbox row sits
  on the failing signal channel gets that row `FAILED` after three attempts, the
  fallback row of the next chain channel (`matrix`) is queued in the same
  transaction, drains `SENT` in the same run and really reaches a local Matrix
  mock — and the `GET /api/v1/tickets/:ticketNo` answer carries exactly one
  `notification_failed` (`attempts: 3`) and one `notification_sent` event next to
  the `created` event; a second drain over the terminal rows writes no event and
  no row, and the last channel of the chain ends `FAILED` without a fallback.
  Phase 7 is closed: channel failure retries and falls back, and the history shows
  it (`PLAN.md` §16 phase 7, §20 acceptance 10). No product code changed.

- The channel fallback chain (WP-M7-05): an outbox row that exhausts its three attempts no
  longer simply ends `FAILED` — `drainOutbox` takes the next channel of
  `escalationChain(env)` (the configured channels in `configuredChannels` order,
  `PLAN.md` §12 "then the next channel in the escalation chain"), ends the row `FAILED`
  with its `notification_failed` event and queues one `PENDING` fallback row for that
  channel in the same transaction — same ticket, same machine-readable `{ ticketNo,
  priority, objectName }` target params, no photo, no contact data — but only if the ticket
  has no pending row for that channel already, so a channel is never notified twice. The
  drain loop claims the fallback row in the same run, which the chain length bounds.
  `OutboxDrainResult` gained `fallback` (log code `channel_fallback`). Covered by a
  mocked-channel unit spec (escalation, pending guard, chain end) and a PostgreSQL
  integration spec asserting both rows, both states and both events of one escalation.

- The ntfy `view` action label is localized (WP-M7-04b): `server.de.json` and
  `server.en.json` gained the `notification.action_label` key (`Öffnen` in the German
  reference locale, `Open` in English) and `NtfyConfig` in
  `apps/api/src/notifications/channels/ntfy.ts` gained the optional `locale` of the
  shared `ServerLocale`. The label of a payload is now
  `t(config.locale ?? 'de', 'notification.action_label')` through the shared server
  `t()`, so the hard-coded German literal of WP-M7-01 never reaches a payload again
  (`PLAN.md` §3.1); an unset locale keeps the `de` default and
   `configuredChannels(env)` stays unchanged, because the environment carries no channel
   locale yet. The package announced as "the outbox worker and the localized ntfy action
   label" was split before any code was written (`PLAN.md` §17 file limit): the drain
   worker, its retries and the `notification_sent`/`notification_failed` events moved to
   **WP-M7-04c**.

- The outbox drain worker (WP-M7-04c): `apps/api/src/notifications/outbox.ts` claims the
  oldest `PENDING` outbox row atomically (`UPDATE ... WHERE state = 'PENDING'` plus the
  `(state, created_at)` index of migration 0019), sends through `configuredChannels(env)`,
  retries up to three attempts with backoff, writes `SENT`/`FAILED` and appends exactly one
  `notification_sent`/`notification_failed` event (`actorKind: 'system'`, payload
  `{ channel, ticketNo, attempts }`) to the ticket history per row. Rows whose channel is no
  longer configured end `FAILED`. `startNotificationOutboxJob` runs the drain on a per-minute
  pg-boss schedule with one short-lived pool per job, started only from the direct API start
  next to the other pg-boss jobs; `buildServer()` stays job-free. Covered by a mocked-channel
  unit spec and a PostgreSQL integration spec asserting claims, states, `attempts`, the
  ticket's `created` event and the localized ntfy `view` action label of WP-M7-04b in the
  payload.

- The notification outbox is written with the ticket (WP-M7-04): the
  `notification_channels`, `push_subscriptions` and `outbox` tables land in
  migration `0019_notification_outbox` (the `state` check `PENDING`/`SENT`/`FAILED`,
  `attempts` default `0`, the `outbox(state, created_at)` index; the first two are
  rows only, no routes). `notifications/outbox.ts` adds `enqueueOutbox(database, ticket, env)`,
  which inserts one `PENDING` row per channel of `configuredChannels(env)` with a pure insert
  and no HTTP call, and `apps/api/src/tickets/report.ts` calls it inside the create transaction
  right after the ticket and its `created` event — the row carries only the machine-readable
  message parameters `{ ticketNo, priority, objectName }` (no photo, no contact data). The
  channel failure can therefore never lose the event; draining the rows with retries
  remains the announced follow-up WP-M7-04c.

  `apps/web/src/features/settings/NtfySubscription.tsx` renders a `qrcode.react`
  card whose QR carries the public subscription address
  `${NTFY_PUBLIC_URL}/${NTFY_TOPIC}` from `docs/DEPLOYMENT.md` — the values are
  component props with a build-time `VITE_NTFY_PUBLIC_URL` / `VITE_NTFY_TOPIC`
  fallback, so no API route exposes them; a `deepLink` switch carries the
  `ntfy://<topic>` payload of the ntfy app instead. The card labels itself with
  the new `ntfy.subscribe`, `ntfy.qrLabel` and `ntfy.appHint` keys of the
  `common` namespace (`de` and `en`) and renders nothing while the channel is
  not configured. The follow-up chain WP-M7-04 (outbox rows in the create
  transaction) and WP-M7-04b (the outbox worker and the localized ntfy action
  label) is planned.

- Every user gets a sortable klarmname (WP-M2-93): the `users` table gains
  `given_name` and `family_name` (`NOT NULL`, default `''`, length ≤ 64, stored
  trimmed) behind migration `0018_user_klarmname`, indexed by `users_name_idx` over
  `lower(family_name), lower(given_name)`. The migration and the base seed derive the
  family name of the bootstrap administrator from the e-mail local part, so a fresh
  deployment has a sortable name without inventing a given name.

- Every user gets a theme in the user management (WP-M2-92e): the create and the
  edit form of `/admin/users` carry a select for `auto` (the system preference),
  `light` and `dark`; the value is stored with the user and the shell applies it.

- The web shell knows a light mode (WP-M2-92d): the theme of the user (`auto`,
  `light` or `dark`) is applied as a class on the shell root, `auto` follows the
  system preference of the browser. The light palette only remaps the Tailwind
  color variables, so every page keeps its colors without a new utility class.

- The theme is part of the user contract (WP-M2-92c): `userThemeSchema` knows
  `auto`, `light` and `dark`, the user summary, the create and update requests
  and the `/me` answer carry it. The admin user API reads and stores the theme,
  so an admin can set the appearance of every user.

- The theme of a user travels through the session (WP-M2-92b): the session user and
  the login response carry the stored `theme` next to the locale, so the web shell
  can apply the user's own appearance.

- Every user gets a theme setting (WP-M2-92): the `users` table gains a `theme`
  column (`auto`, `light` or `dark`, default `auto`) with the check constraint
  `users_theme_check`; migration `0016_user_theme` is part of the journal.

- The ticket detail page (WP-M2-91) shows an always visible action panel below the
  title instead of an "Aktionen" toggle: payload actions carry inline input fields
  (placeholders from the former prompts), missing required values and API failures
  show as an inline alert line, the hard delete confirms by typing the ticket
  number — no `window.prompt`/`alert`/`confirm` dialogs any more. New i18n keys
  `detail.errors.fieldRequired`, `detail.errors.deleteConfirmMismatch` and
  `detail.prompt.deleteConfirmNumber` in de and en.

- The public report form offers the optional short title (WP-M2-90c): with
  `titleEnabled` from the QR resolve the form renders a `Kurztitok (optional)`
  input between the fault chips and the free text, and the submit body (also the
  offline outbox body) carries the trimmed value; without the switch no title
  input exists at all. New i18n key `report.titleField.label` in de and en.

- The branding page gains a `titleEnabled` checkbox (WP-M2-90b): it prefills
  from the branding response, is disabled without `settings.write` and the
  `PUT` body carries the switch together with the company name; new i18n keys
  `branding.field.titleEnabled` and `branding.hintTitleEnabled` in de and en.

- `scripts/update.sh` compares the version of the running `api` container with
  GitHub instead of the folder `VERSION` (WP-M3-16); a folder that is already
  newer than the containers no longer blocks the rebuild.

- A host deploy hook for the update menu (WP-M3-15): `npm run deploy:hook`
  listens for the webhook of the administration, checks the token and starts
  `scripts/update.sh --yes` in the background. Setup in `docs/DEPLOYMENT.md`.

- The update menu of the administration (WP-M3-10): the version badge of the
  shell header is a button for a user with `system.update` and opens a panel
  with the installed version, the installed commit, the newest upstream commit,
  the commits behind it and a button that starts the deployment after an
  explicit confirmation. Every other user keeps the plain version text.

- The update control of the administration is replaced by a GitHub check and a
  deploy webhook (ADR-0007, WP-M3-07 … WP-M3-08): `GET /api/v1/admin/update/check`
  answers the installed version, the newest commit of the branch and the
  commits behind it (cached for a minute), `POST /api/v1/admin/update/start`
  checks again on the server, calls the deploy webhook with the header
  `X-Deploy-Token` and answers immediately — the deployment replaces the API
  container. A second start inside five minutes is refused. The tokens belong
  to the API and never reach the browser.

- The stack carries the configuration of the update control (WP-M3-09): the
  `api` image takes the build argument `GIT_COMMIT` and the tracked `VERSION`
  file, the compose file passes the keys `GITHUB_REPO`, `GITHUB_BRANCH`,
  `GITHUB_TOKEN`, `UPDATE_WEBHOOK_URL` and `UPDATE_WEBHOOK_TOKEN` to the API
  and gives it `host.docker.internal:host-gateway`, so a deploy hook on the
  host is reachable. `.env.example` documents the keys.

### Changed

- The ticket list shows one line per ticket (WP-M9-21): instead of a card grid every
  ticket is a line — the ticket number and the object on the left, the mini timeline with
  the remaining or overdue time in the middle, the status, the priority and the times on
  the right. The whole line is one link to the ticket detail instead of a link on the
  ticket number only, and the rows come in the deadline order of WP-M9-20, so the nearest
  deadline is on top. Below `md` the line stacks, so the phone shows the same information
  without a horizontal scroll, and the dates follow the language of the interface.

- The ticket list can be ordered by the deadline (WP-M9-20): `GET /api/v1/tickets` with
  `order=deadlineAt` sorts the rows by the deadline in the requested direction and puts the
  open tickets before the finished ones, so the nearest deadline is on top and the list
  does not start with the oldest closed ticket. The ticket number is the tie-breaker, so
  the pages of a long list stay stable.

- The ticket list becomes mobile first (WP-M2-91b): instead of a wide table with
  horizontal scrolling every ticket is a card — number and status badge, priority,
  object and object number, the mini timeline with the remaining time and the
  reported time, then the link to the ticket. One column on the phone, two from
  `sm` and three from `xl`; status and priority are read from the i18n keys now
  (the hardcoded German labels are gone) and the list controls get 44 px touch
  targets.

- The update menu tells the failures of a start apart (WP-M3-14): a refused
  webhook, an unknown answer of the API (with its HTTP status) and a **lost
  connection** — the last one is the normal case of a deployment that replaces
  the API container, so the panel says that the stack is probably restarting
  and offers a reload of the page.
- The router shows a page of the application instead of the developer page of
  React Router (WP-M3-13): an unknown address gets a "not found" page with a
  link to the dashboard, an unexpected error gets an error page, and the
  retired address `/admin/update` leads to the administration home — the update
  menu lives in the version badge of the header.
- The page `/admin/update` and its host update section are gone (WP-M3-10); the
  update lives in the version badge of the header now. The PWA updates itself
  (`registerType: autoUpdate`), so the manual cache control of the old page is
  not needed any more.
- The update agent is retired (WP-M3-11, ADR-0007): the workspace `apps/agent`,
  the compose service `update-agent`, the `agent` target of the `Dockerfile`, the
  environment keys `UPDATE_AGENT_*` and the state volume `update-state` are
  gone. The deployment of the stack is triggered by the webhook of the operator
  (or by `scripts/update.sh` on the host), the application needs no privileged
  container any more. The table `update_runs` stays as the history of the
  retired runs.

- The Dexie outbox learns the offline internal writes (WP-M5-01): a v2 table
  `internal_actions` queues acknowledge, comment and decline with their own
  `client_uuid` idempotency key, replays oldest-first on app start and the
  `online` event and reports both queues through `pendingWrites()`. The rows
  wait for their endpoints (WP-M5-02 … WP-M5-04); nothing sends yet beyond the
  delivery skeleton.
- Phase 5 (offline internal actions) is planned in nine work packages  (WP-M5-01 … WP-M5-09 in `work-packages/m5/`): the Dexie v2 internal action
  queue, the `internal_action_receipts` table with its replay-safe helper, the
  `clientUuid` idempotency on the acknowledge/decline routes plus an internal
  comment route, the offline queue and conflict UI, stale-while-revalidate
  ticket reads, the E2E exit-criterion test and the cache clear on sign-out.
  No product code yet — this is the split required by `PLAN.md` §16/§17.
- The update agent removes the images it replaces (WP-M3-02b): it snapshots the
  image ids of the three owned image names before the compose rebuild, removes by
  id whatever neither a current tag nor a container of the compose project needs
  and keeps the project-labelled `docker image prune -f` as the last best-effort
  command. It never runs an unscoped prune; `--gc` remains a property of
  `scripts/update.sh`.
- Admins can permanently delete cancelled tickets (`ticket.delete`,
  `DELETE /api/v1/tickets/:ticketNo`): the deletion is recorded in the
  append-only `ticket_purges` log and the ticket's photos are removed from the
  uploads volume; the ticket detail page shows an "Endgültig löschen" button
  once a ticket has been storniert (WP-M2-75 … WP-M2-78).
- The host update page shows the comparison of the built-in version and the
  newest GitHub tag (WP-M2-74). If the agent knows no checkout version, the
  version of the web app is used; an unparseable version is named instead of
  claiming the latest version. The run button only appears when the agent is
  reachable; otherwise the page carries a one-time command that discovers the
  compose project and its directory from the running web container.
- A panel deployment without git metadata now builds the current sources
  (WP-M2-73): the agent and `scripts/update.sh` set `IMAGE_BUILD_CONTEXT` to the
  repository URL when `.env` has no Git build context, so a synced project
  folder cannot rebuild the old files and report success.

- The host update runs as a shell script without the agent (WP-M2-72):
  `sh scripts/update.sh` compares `VERSION` with the newest GitHub tag, pulls a
  git checkout or lets the compose build fetch the sources in a panel
  deployment, rebuilds the running stack and prunes the old images. The admin
  page now points to that command; the update agent remains optional for the
  in-UI button.

- The host update works in panel deployments (WP-M2-71): without a git work
  tree the pull step is skipped instead of failing the run, so an Arcane project
  folder updates through the compose build. The agent reads the compose project
  from its own container label (no second stack), keeps running optional
  profiles such as `backup`, never recreates itself through the `update`
  profile, and prunes only the dangling images of its own project.

- The host update page shows the raw failure detail (WP-M2-70): below the
  translated error code of the last run, a scrollable monospace block renders the
  sanitized output tail stored by the agent; no block appears when the run has
  no detail.
- A host update names why it failed (WP-M2-68, WP-M2-69): the update agent keeps
  the output tail of the failing step — stderr first, control characters dropped,
  every credential redacted and cut to `UPDATE_ERROR_DETAIL_MAX_CHARS` — and the
  API stores it in `update_runs.error_detail` (migration
  `0011_update_runs_error_detail`) and answers it with the last run.

- The object list shows the system type (WP-M2-66): a new `Typ` column renders the
  category derived from `external_type` as a quiet badge whose title carries the stored
  BMAcloud name; a locally maintained object shows a dash instead.

- The BMAcloud sync writes the system type (WP-M2-65b): every run fetches the
  `GET /anlagentypen` reference list best-effort and stores the resolved type name in
  `objects.external_type`; an unknown `typ` stays `null` and a failed reference call leaves
  the stored name untouched instead of clearing it.

- The BMAcloud contract knows the system type (WP-M2-65): `bmaAnlageSchema` reads
  the `typ` id, `GET /anlagentypen` resolves it to a name and
  `externalTypeCategory()` classifies the German type keywords into `BMA`, `LICHTRUF`,
  `RWA`, `EMA` and `SPRACHALARM` — an unknown name stays `null`, no `SONSTIGE` guess.

- The host update section checks for a newer version (WP-M2-63): „Update prüfen“
  reads the newest StörDesk release from GitHub, offers „Jetzt updaten“ when that
  version is newer than the running one and reports „Sie nutzen die neueste
  Version“ otherwise; a failed lookup never blocks the manual update.
- Every object answer of the API carries the read-only `externalType` (WP-M2-64):
  `objects` gains the nullable `external_type` behind migration
  `0010_object_external_type` — the human-readable system type name of an externally
  maintained object; locally created objects keep it `null` and the create/update
  inputs never accept it.
- The host update works without a configured secret (WP-M2-59, WP-M2-60): the
  agent creates its own bearer and writes it into the state volume, the API
  mounts that volume read-only and reads the value there. `UPDATE_AGENT_TOKEN`
  in the `.env` is optional and only pins a fixed bearer — the operator has to
  configure nothing.
- The administration carries the guide for the host update (WP-M2-61): while the
  agent does not answer, the section shows the two steps and the command that
  starts it on the host, with a button that copies it to the clipboard.

- The host update page names why the agent is not reachable (WP-M2-57,
  WP-M2-58): the status of the API carries the cause — the token
  `UPDATE_AGENT_TOKEN` is missing in the `.env` of the host, the agent answered
  something invalid, or the agent does not run. The page shows the matching
  text; the last one names the command that starts the agent.
- The host update section in the admin update page (WP-M2-55): `/admin/update` shows
  the state of the update agent, the version on the server and the last run, and starts
  a host update with an explicit confirmation — a confirm step, never a password. The
  section is hidden without the permission `system.update`; the guard of the server
  stays the only enforcement point. During the rebuild the API is briefly unreachable,
  and the page says that instead of failing.
- The admin update API (WP-M2-54): `GET /api/v1/admin/update/status`,
  `POST /api/v1/admin/update/run` and `GET /api/v1/admin/update/runs`, guarded
  with the new permission `system.update`. The API stays a client: it calls the
  agent over the internal network with the bearer `UPDATE_AGENT_TOKEN` and
  validates every answer, so a malformed answer becomes an error and never a
  crash. A run is written before the agent starts — the rebuild replaces the
  API container — and a `RUNNING` row is reconciled with the state of the agent
  after the restart. A second run is refused with `409`, a run inside the
  cooldown with `429`.
- The compose invocation of the agent and its image in the smoke test
  (WP-M2-53b): the compose client of the agent runs in the project directory,
  so it reads the `.env` of the checkout and therefore the project name of the
  host — without it the agent would deploy a second stack next to the running
  one. The smoke test builds the image of the agent, so CI proves that the
  Alpine packages for `git` and the Docker CLI exist.
- The image, the compose service and the environment of the update agent
  (WP-M2-53): the image `stoerdesk-agent` is `node:22-alpine` with `git`,
  `docker-cli` and `docker-cli-compose`; the service `update-agent` lives
  behind the compose profile `update`, so the normal `docker compose up -d
--build` never touches it and the agent survives the redeploy it triggers. It
  is mounted with the checkout, the Docker socket and a state volume, listens
  only on the internal network and publishes no host port. `npm run env:create`
  generates the bearer `UPDATE_AGENT_TOKEN`.
- The update agent HTTP server (WP-M2-52): the agent speaks three paths —
  `GET /status`, `POST /run` and `GET /runs` — on the internal network only,
  behind the bearer `UPDATE_AGENT_TOKEN`, which is compared in constant time
  over the digests. Without a web framework, so the agent image stays free of
  runtime dependencies; a request carries no command, no path and no argument.
  The last run is written to the state file of the agent, so a restart of the
  agent does not lose it.
- The update agent service core (WP-M2-51): the new workspace `apps/agent` holds the
  logic of a host update — `git pull` → `docker compose up -d --build` → `docker image
prune -f` — with the command runner injected, so the whole logic is tested without a
  shell and without a Docker daemon. A run knows three steps and three error codes, never
  the output of a command, and the owner of the checkout is restored after the pull.
- The `update_runs` table (WP-M2-50): one row per host update — status, the
  versions before and after the pull, the error code and the id of the agent run,
  so a run stays visible in the administration after the restart of the API.
  Migration `0009_update_runs`.
- Permission `system.update` and the update schemas (WP-M2-49): the new key belongs
  to the role `admin` only — a host update is a deployment decision. `@stoerdesk/shared`
  exports the schemas of the update contract (the run row, the agent status, the answers
  of the admin routes), so the API and the update agent speak one protocol.
- Host update agent — decision and work plan (WP-M2-48, ADR-0006): stage 2 of the
  self-update runs the real host update (`git pull` → `docker compose up -d --build` →
  `docker image prune -f`) without giving the `api` container any host access. The agent is a
  service of the **same** compose project behind the profile `update`, so the normal
  `docker compose up -d --build` never touches it and it survives the redeploy it triggers; it
  is mounted with the checkout and the Docker socket, listens only on the internal network
  behind the bearer `UPDATE_AGENT_TOKEN` and decides itself what a run is. The chain
  WP-M2-49 … WP-M2-56 implements the contracts (`system.update`), the `update_runs` table, the
  agent, its image and compose wiring, the admin API, the page section and the documentation.
  `specs/18-self-update.md` §18.4–§18.6 now describe the topology and the agent protocol.
- API-key field on the BMAcloud sync page (WP-M2-47): `/admin/bma-sync` shows the effective
  source (`db`, `env` or `none`), a write-only key field, `Schlüssel speichern` / `Save key`
  and — only for a stored key — `Gespeicherten Schlüssel löschen` / `Delete stored key`. The
  field is gated on `object.import`, never prefilled and never echoed back; after save the
  credentials query refreshes to the stored source.
- The scheduled BMAcloud pull resolves the same key as the manual trigger (WP-M2-46): one
  startup read of the `bma.api.key` row with `BMA_API_KEY` as fallback decides whether the
  `bma-anlage-sync` queue is scheduled at all, and every run reads the key again — a key
  stored or removed on the admin page takes effect without an API restart. Without a key in
  either source the job still refuses to start and logs only the fixed reason.
- BMAcloud bearer key configurable in the administration (WP-M2-45, ADR-0005): the key
  may now live in the `settings` row `bma.api.key` and wins over the `BMA_API_KEY`
  environment, so an image-based deployment that cannot edit `.env` is no longer stuck
  on `bma_not_configured`. New admin routes `GET`/`PUT`/`DELETE
/api/v1/admin/bma-sync/credentials` — the status answers `{ configured, source }`
  (`db` / `env` / `none`) only, the stored key is never echoed, never logged and never
  written into a run row. ADR-0005 supersedes only the credential rule of ADR-0003; the
  read-only client and the `object.read` / `object.import` guards stay. The key field on
  the sync page followed in WP-M2-47.
- Self-update decision and spec (WP-M2-43, ADR-0004): the admin update control is
  an out-of-band host update agent, never shell execution in the `api` container
  and never an OS/Linux password. Stage 1 is implemented as a client-only clean PWA
  update on the guarded `/admin/update` page (WP-M2-44): it shows the app and
  service-worker versions, checks for a waiting worker, activates it with
  `SKIP_WAITING`, can clear PWA caches and blocks reload/cache-clear while the
  offline outbox still has queued or sending reports. Stage 2 (agent container on the
  Docker socket, `UPDATE_AGENT_TOKEN`, an `update_runs` table and a `system.update`
  permission) stays planned. New `specs/18-self-update.md`.

### Fixed

- The milestone markers of the ticket timeline sat above the bar instead of on it: the
  report marker (`created`) was a half dot floating over the start point of the axis,
  because the markers were drawn inside the clipped box of the bar. The markers now live
  in an overlay next to the bar — every dot is a whole circle centered on its own time
  position and on the bar, so the report marker sits on the start point of the axis. The
  tooltip names the milestone in the language of the interface ("Meldung eingegangen ·
  09.11.26, 08:00") instead of the machine key and the raw ISO string, the tick of the
  deadline is no longer clipped at the end of the axis, and the numbers of the scale start
  and end with the axis (WP-M9-22).

- The iCal token test was flaky: the "tampered" signature replaced the last character of
  the base64url HMAC with `A`, but that character carries only four significant bits, so in
  about one of sixteen runs the tampered token was byte-identical to the valid one and the
  route answered `200` instead of `404` (this is what failed the check run `v1.0.115`). Both
  tests now tamper with the first character of the signature, which always changes the
  signature; the assertion itself is unchanged.

- The settings gear and the administration home did not link every available page:
  the menu now carries "Fristen" (`/admin/deadlines`) and an explicit "Meine
  Einstellungen" (`/settings/me`) entry in a new personal group, and the
  administration home links "Darstellung" (`/admin/branding`) after the on-call
  module. The administration menu order now matches the module order of the
  administration home.

- `generateOncallSlots` produced wrong UTC instants when the process time zone was
  not UTC: it read the zoned wall clock with `getUTC*` while `fromZonedTime` reads the
  candidate's local fields, so under the shipped `TZ=Europe/Berlin` every slot moved
  by the UTC offset and the 167/169-hour DST weeks came out wrong. The generator now
  uses local getters and `setDate`, making the DST rule independent of `TZ`
  (WP-M8-16).

- The ticket workflow E2E timed out clicking the top-right options button of the
  ticket detail (`getByRole('button', { name: /Optionen|Options/ })`). The button now
  carries `data-testid="ticket-options-button"` and the workflow E2E targets it by test
  id instead of the localized accessible name, waits for network idle after navigating
  to the ticket detail, and only opens the options menu when it is not already open —
  `performAction` previously toggled the menu and closed it on the second workflow step,
  hiding the action entry ('Annehmen' / 'Accept'). Both `de` and `en` runs of
  `full ticket workflow with audit trail` pass again.
- The ticket workflow E2E asserted the localized actor kind of the audit trail with
  `getByTestId('ticket-history').locator('.text-xs.text-slate-400')` against a single
  text: all seven history rows carry those classes, so the strict-mode locator
  resolved to seven elements and both locale runs of the test aborted. The
  expectation is an array now — one localized `actorKind.user` label per element —
  with a `toHaveCount(7)` guard, and the history must not contain the raw
  `actorKind.` key any more. The check runs of the versions v1.0.7 and v1.0.8 stay
  red: they predate the repair, and a published tag cannot be changed afterwards.
  The working build is the version v1.0.9.
- The ticket workflow and the offline internal E2E expect the labels of the
  internal detail page again: the status badge and the history rows render
  `status.values.*` and `status.events.*`, so the six Playwright tests of
  `workflow.spec.ts` and `offline-internal.spec.ts` that searched for the raw
  event types — and for the German status labels in the English run — failed.
  The badge and the history carry a test id now, so every expectation is scoped
  to its own element, and the English run uses the English labels. The check runs
  of the versions v0.1.173 … v0.1.195 and v1.0.0 stay red: they predate the
  repair, and a published tag cannot be changed afterwards. The working build is
  the version v1.0.1.
- The self-update groundwork for the step deadline (WP-M3-05): the shared update
  schema now carries the fixed error code `update_step_timeout`, the spec §18.4
  records the deadline rule and `/admin/update` labels the code in de and en.
- The update agent no longer stays `running` forever (WP-M3-06): every run
  step (`git pull`, `docker compose up -d --build`, the image clean-up) runs
  against `UPDATE_STEP_TIMEOUT_MS` (default ten minutes). When a step passes
  its deadline, the run fails with `update_step_timeout`, reaches
  `finishedAt` and shows the error instead of staying `Läuft` endlessly.
- The ticket detail page reaches the workflow routes: every action event is
  mapped to its API route segment (`/review`, `/work-order`, `/assign`, …)
  instead of posting the internal event name, and the JSON content type is only
  sent together with a body (Fastify rejects an empty JSON body with 400). The
  WP-M4-01 workflow E2E, whose CI check runs v0.1.123 … v0.1.125 were red, now
  drives every transition through the "Actions" panel and passes 10/10 against
  a real database and Chromium.
- The start command of the update button runs in the project folder and no longer
  follows a container-internal path (WP-M3-03, WP-M3-04). It used the
  `com.docker.compose.project.working_dir` label of the running web container as
  a host path, but that label names the folder as the machine that ran compose
  saw it: a panel such as Arcane runs compose inside its own container, so the
  label says `/app/data/projects/<project>`, the host does not know that path and
  the copied command failed with `cd: …: No such file or directory`. The command
  now keeps only the project name from the `com.docker.compose.project` label,
  pins the folder it is copied into with `--project-directory "$PWD"` and stops
  guessing directories.
- A panel deployment without a project `.env` can start the update agent
  (WP-M3-04): the compose file requires `POSTGRES_PASSWORD` and `SESSION_SECRET`
  and the `api` service declares `env_file: .env`, so compose failed before the
  agent started. The start command now appends only the missing keys to `.env`,
  reading every value inside the running `api` container with `printenv` (never
  on the host command line), creates the file under `umask 077` and never
  rewrites an existing secret.
- Der Startbefehl bricht ab, wenn er nicht im Projektordner liegt (WP-M3-04b):
  fehlt die `docker-compose.yml` im aktuellen Verzeichnis, endet der Befehl mit
  `exit 1` und einer klaren Meldung, bevor Compose oder die `.env` angerührt
  werden.
- The permanent ticket deletion typechecks again (WP-M2-77): `tickets` has no
  `object_no` column, only the `object_id` foreign key, and the deletion used
  `sql` without importing it. The object number that `ticket_purges` requires is
  now selected through the object of the ticket — objects are only soft-deleted,
  so that join always finds the row.
- The host update script no longer leaves an untagged image behind on every
  update (WP-M3-02). `docker compose up -d --build` moves the fixed
  `stoerdesk-{api,web,agent}:latest` tags to the new images, so the previous
  image of each service turns tagless; the only cleaner was `docker image prune
-f --filter label=com.docker.compose.project=<project>`, and that filter finds
  a tagless image only when the build wrote the label into it. Builds from a
  remote build context (`IMAGE_BUILD_CONTEXT`, the Arcane path), the
  `docker-compose` v1 fallback the script accepts and every aborted build carry
  no such label, so each of them left a `<none>` image on the host.
  `scripts/update.sh` now snapshots the image ids it owns before the rebuild —
  `STOERDESK_OWN_IMAGES` plus the Compose default names of the project — and
  afterwards removes by id whatever is neither the current image of one of its
  names nor the image of a container of this project (`docker rmi` without `-f`,
  so an image still held by a container stays), also after a failed rebuild. It
  adds `--remove-orphans`, never runs an unscoped `docker image prune -f`, and
  gains `--cleanup` (no pull, no rebuild) plus `--gc` (`STOERDESK_GC_UNTIL`,
  default 168 h) for the backlog of tagless images and build cache an older
  version left behind. The update agent keeps its label-only prune until
  WP-M3-02b ports this to it.
- The background-sync queue of the service worker matches the public report path
  through its API base (WP-M3-01): the route compared the bare `/v1/public/tickets`
  while the app requests `/api/v1/public/tickets`, so the queue never matched. The
  predicate now lives in `apps/web/src/lib/sw-routes.ts` and is unit-tested; the Dexie
  outbox, the online path and the API are unchanged. The phase 3 closure also filled
  the previously placeholder `specs/09-offline.md`.
- The public report E2E smoke tests use the live fault catalog label `Line interruption`
  in English. The old expectation still waited for `Fire alarm system completely out of
service`, which the bootstrapped standard fault types no longer offer.
- The version of the web shell reads the nearest **version** tag only. A moving pointer
  tag such as `latest` is not a version and must neither become the version in the
  header nor break the quality gate: the check run of the release `v0.1.0` failed
  because `git describe` answered `latest` instead of the version tag.
- The promotion of the `latest` image tag runs in a job of its own and the promotions of
  one image are serialised (concurrency group `latest-<image>`). Without that, two
  parallel publish runs could write `latest` in the wrong order and move it back to an
  older version.
- The publish chain of the GitHub Actions no longer loses a version and no longer
  leaves `latest` behind. A queued publish run was cancelled when a newer publish run
  was queued (the versions `v0.0.87` and `v0.0.97` never reached the registry),
  because all publish runs shared one concurrency group; every version now has its
  own group. `latest` was written by every build, so the version that happened to
  finish last won and `latest` pointed to `v0.0.98` while `v0.0.99` was already
  published; the build writes only the version tags now and a promotion step points
  `latest` at the newest version that exists in the registry.
- The version in the web shell is the application version produced by the development
  workflow. The pre-commit hook writes the next version into the tracked `VERSION` file,
  the post-commit hook tags exactly that value, and image builds read it without git
  metadata or an `.env` entry; the misleading `VITE_APP_VERSION` name and the manual
  `env:version` refresh are gone.

### Changed

- The phase 2 record is closed. Commit `a6804ed` landed the BMAcloud contract
  (`specs/17-bmacloud-sync.md`, ADR-0003, the `PLAN.md` §11 block) without a work package
  and without a WP id in its subject, and it committed a stray test file at
  `apps/web/apps/web/src/__tests__/diag.test.tsx`, outside the source tree. `WP-M2-32`
  records that commit, deletes the stray file and announces the implementation as
  `WP-M2-33` … `WP-M2-39` — the commit wrote no client, no `bma_sync_runs` table, no
  `BMA_*` environment key, no route and no page, so `PLAN.md` §11 is documentation until
  that chain runs. The stale `status:` lines of the `m2` documents `09` … `31` now say what
  the code already does, and the stale `Follow-up WP:` line of `WP-M2-26` is corrected: it
  named a work-package file that never existed.
- The phase 1 record is complete. Seven phase 1 commits had landed without a work
  package — `3e1c0f8` (centred login card and version display), `71fd066` (RBAC and
  administrator bootstrap on API start), `f0e0fcc`, `1d56aad` and `d994911` (PostgreSQL
  service in the `check` job, the dead Playwright job, the publish queue),
  `4da1c7b`/`ad0b45b` (configurable login rate limit) and `7e64dd1` (the end-of-session
  commit rule). `WP-M1-23` … `WP-M1-27` are the retroactive work-package documents for
  them, and every `m1` work-package document now carries a `status:` line.
- `.env.example` documents `LOGIN_RATE_LIMIT_MAX` and `LOGIN_RATE_LIMIT_WINDOW`; the API
  environment has had both since `ad0b45b`, but the template of `PLAN.md` §15 was missing
  them.

### Added

- The external-maintained badge in the object list (WP-M2-39): a row whose `external_id` is
  set carries a quiet "extern gepflegt" / "externally maintained" badge next to the object
  number, with a `title` naming BMAcloud and the overwrite rule. The badge is independent of
  the active badge and neither is colour-only. The object list had no page test before, so
  the WP adds one. With this the BMAcloud chain WP-M2-32 … WP-M2-39 is complete.
- The BMAcloud sync card on the administration home (WP-M2-38): `MODULES` gains
  `bmaSync` → `/admin/bma-sync` directly after the roles card, labelled
  "BMAcloud-Abgleich" / "BMAcloud sync" and saying that the object list is pulled
  read-only. The admin home had no page test before, so the WP adds one covering the
  new card and the planned badge.
- The BMAcloud sync page in the administration (WP-M2-37): `/admin/bma-sync` lists the run
  history with the localized status label (never colour alone) and the five counters, shows
  the conflicts of the newest run, triggers a manual pull with "Jetzt abgleichen" and carries
  the schedule form, prefilled from the stored or effective pair. The trigger needs
  `object.import`, the schedule needs `object.write`, and `bma_not_configured`,
  `bma_request_failed`, `bma_bad_response` and `invalid_request` answer localized hints.
- `GET /api/v1/admin/bma-sync/schedule` (WP-M2-36b): the admin page of WP-M2-37 prefills
  its schedule form, and the effective pair — the stored `bma.sync.enabled` /
  `bma.sync.cron` settings with the `BMA_SYNC_*` environment as fallback — was not
  readable anywhere. The route is guarded by `object.read` and answers the existing
  `bmaSyncScheduleResponseSchema`; it closes the open question of WP-M2-36.
- The standard fault types are bootstrapped into `text_templates` when the API
  starts (WP-M2-42): the eight texts with their `de`/`en` row, marked as done in
  `settings`, so a deleted type stays deleted and an edited translation is kept.
- The fault type administration (WP-M2-40 … WP-M2-40f): the eight standard fault
  types of the report form are bootstrapped in `text_templates`, an administrator
  creates, edits, archives and deletes them at `/admin/text-templates`, an archived
  type keeps labelling existing tickets but leaves the form, and a type that a ticket
  carries cannot be deleted (`409 text_template_in_use`). The forms read the catalog
  from the API instead of a compile-time list.
- The BMAcloud admin API and scheduled sync job (WP-M2-36): the guarded admin routes
  `GET /api/v1/admin/bma-sync/runs`, `POST /api/v1/admin/bma-sync/run` and
  `PATCH /api/v1/admin/bma-sync/schedule`, the effective schedule from the
  `bma.sync.enabled` and `bma.sync.cron` settings with `BMA_SYNC_*` fallback, and a
  pg-boss job that starts only when `BMA_API_KEY` is present.
- The BMAcloud mapping and sync service (WP-M2-35): `mapAnlage` per §17.3, and
  `syncBmaAnlagen` that matches objects by `external_id` then `object_no`,
  reports `object_no_taken` instead of overwriting a local object, soft-deactivates
  objects that disappeared from the pull and records every run with its counters.
- The `bma_sync_runs` table behind migration `0007_bma_sync_runs` (WP-M2-34): one row per
  BMAcloud pull with the status check `RUNNING`/`SUCCESS`/`PARTIAL`/`FAILED`, the five
  counters, the conflicts as jsonb and an index on `started_at` for the run history.
- The read-only BMAcloud client of the object sync (WP-M2-33): `GET /anlagen` and
  `GET /anlagen/{aid}`, a hard-coded `GET` in the private request helper (the write
  endpoints stay unreachable), `BMA_API_BASE_URL` / `BMA_API_KEY` / `BMA_SYNC_ENABLED` /
  `BMA_SYNC_CRON` in the environment schema and `.env.example`, and `bma_not_configured`
  before any request when the key is empty. The key never reaches an error message or a log.
- The administration pages `/admin/users` and `/admin/roles` carry a quiet back link to the
  administration home `/admin` (WP-M2-26), labelled `settings:admin.back` in `de` and `en`.
- The duplicate hint of the public report form. The form asks the API for the open
  tickets of the object and offers the two answers of the plan: "Ergänzen" appends the
  text of the reporter to the open ticket as a public comment event, "Trotzdem neu
  melden" creates a new ticket that points at the open one (`tickets.parent_ticket_id`).
  The QR token of the object is the capability of the public comment, so the status
  token of a foreign ticket is never handed out.
- `npm run release:push` pushes the current branch and every version tag the remote does
  not have yet, one tag per push. GitHub creates no tag push event when more than three
  tags are pushed at once, so a batch push of several tags left the older commits without
  a check run and without published images (`v0.0.93`, `v0.0.94`, `v0.0.95`).
- Monorepo skeleton with npm workspaces (`apps/web`, `apps/api`, `packages/shared`).
- Configuration: TypeScript strict, ESLint (flat config, i18next rule), Prettier,
  Vitest (root and per workspace), Husky, commitlint.
- Scripts: `npm run check`, `npm run i18n:check`, `npm run spec:split`,
  `npm run orchestrate`, `npm run wp:check`.
- Docker setup: `Dockerfile` (targets `api`, `web`), `docker-compose.yml`,
  `docker-compose.dev.yml`, `.env.example`.
- CI: `.github/workflows/check.yml` (Node 22, `npm ci`, `npm run check`).
- Specification structure `specs/` (17 chapter files), work packages
  `work-packages/m1` (12) and `work-packages/m2` (10), documentation `docs/`
  including REPO-MAP and ADR-0001.
- WP-M1-03: Drizzle base schema `apps/api/src/db/schema.ts` with `users`,
  `sessions`, `groups`, `user_groups`, `settings`; UUID v7 as server-side default
  via `gen_uuid_v7()` (ADR-0002), migration `0000_base_tables`, Drizzle client.
- WP-M1-03: migration test (without DB) and integration test against a real
  PostgreSQL 16 database (`TEST_DATABASE_URL`, disposable database per run,
  skipped without a reachable DB).
- Complete Compose stack: `db`, `api`, `web` and the optional `backup` profile
  (`pg_dump`).
- `.env.example` with every variable and explanation; `npm run env:create`
  creates `.env` with generated secrets, so the Compose file never has to be
  edited.
- Persistent volumes for database, uploads and backups; all volume names are
  configurable.
- Notification channels talk only to existing instances (ntfy server,
  signal-cli bridge, Matrix homeserver, SMTP, Telegram); StörDesk ships no
  notification servers. A channel stays disabled while its address is empty.
- `docs/DEPLOYMENT.md`: deployment, volumes, backups/restore, notification
  channels.
- `PLAN.md`: binding build plan with scope, stack decisions, phases, small-model
  work-package limits, acceptance summary and open decisions.
- `docs/WP-TEMPLATE.md` and `scripts/wp-check.mjs`: template and validation for
  work packages that fit a 64k–128k context model.
- Phase 0 work packages in `work-packages/m0/` for local startability, Compose
  resilience, plan anchoring and a Docker smoke test.
- `docker-compose.debug.yml`: optional override that publishes the API host port
  for direct curl and monitoring.
- `scripts/docker-smoke.sh` (WP-M0-04): repeatable Docker smoke test — builds the
  images from the checkout, starts the stack in an isolated Compose project with
  its own volumes and web port `3180`, checks `/healthz` and `/api/v1/health`,
  asserts that the API publishes no host port and removes everything again. Runs
  as the CI job `docker-smoke`, which skips on runners without Docker.
- WP-M0-05: `.github/workflows/build.yml` (`build and push`) publishes the
  versioned `api` and `web` images to GHCR after the `check` workflow succeeded;
  it requires an exact `vMAJOR.MINOR.PATCH` tag at the pushed commit and tags the
  images with the version, the version without `v`, the commit SHA and `latest`
  on `main`.
- `specs/01-rbac.md`: filled RBAC slice (chapters 3 + 4.1) — role model, effective
  permission rule, 37-key catalog, role–permission matrix and the RBAC tables,
  taken from `PLAN.md` §5/§6.
- WP-M1-05: permission catalog of 37 keys plus `DEFAULT_ROLES` for the five system
  roles in `packages/shared/src/permissions.ts`; RBAC tables `roles`,
  `permissions`, `role_permissions`, `user_roles`, `user_permissions` with
  migration `0001_rbac_tables` and the `protect_system_roles()` trigger that
  blocks `DELETE` of system roles.
- WP-M1-05: idempotent seed `apps/api/src/db/seed-rbac.ts`
  (`npx tsx src/db/seed-rbac.ts`) — upserts the catalog and the five system roles,
  rewrites their grants, leaves custom roles and `user_permissions` untouched.
- WP-M1-05: catalog/`DEFAULT_ROLES` unit tests and the integration spec
  `apps/api/src/db/__tests__/rbac.integration.spec.ts`; the CI `check` job now
  provides PostgreSQL 16 as a service, so the database integration tests run
  instead of skipping.
- WP-M1-06: Argon2id password hashing in `apps/api/src/auth/password.ts`
  (`hashPassword`, `verifyPassword` — a malformed stored hash never throws) with
  the `argon2` library, whose prebuilds cover glibc and musl, so the
  `node:22-alpine` API image needs no compiler toolchain.
- WP-M1-06: idempotent bootstrap administrator `apps/api/src/db/seed-base.ts`
  (`npx tsx src/db/seed-base.ts`) from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`,
  linked to the system role `admin`; existing accounts keep their password hash,
  locale and `active` flag, and the CLI output never contains an e-mail or a
  password. `SEED_ADMIN_*` is validated as a pair (valid e-mail, password of at
  least 12 characters) and documented in `.env.example`; seed order is
  migrate → `seed-rbac` → `seed-base`.
- WP-M1-06 (plan): the legacy WP-M1-06 scope was split — the `objects`, `systems`,
  `text_templates` tables and the demo data moved to the new
  `work-packages/m2/00-core-tables-seed.md` (WP-M2-00, phase 2 per `PLAN.md` §16),
  and WP-M2-01 now depends on it.
- `specs/01-rbac.md` §3.6: session and `me` endpoint decisions for WP-M1-07, taken
  from `PLAN.md` §4 (Auth) and §15 (Security) — cookie name/attributes, token hash
  in `sessions.token_hash`, single `401` for unknown e-mail/wrong password/inactive
  accounts, login rate limit, delete-on-read of expired rows, the `me` payload and
  the phase 1 CSRF stance.
- WP-M1-07 (plan): the legacy auth package was rewritten into the small-model format
  and split, because it would have written six source files (`PLAN.md` §17 allows
  3–4): **WP-M1-07** keeps the shared login/me schemas and the session core, the new
  **WP-M1-07b** (`work-packages/m1/07b-auth-routes.md`) holds the session plugin, the
  `requireUser` preHandler and the login/logout/me routes. WP-M1-08 now depends on
  WP-M1-07b and references §3.2/§3.6 instead of the non-existent §3.7.
- WP-M1-07: session core `apps/api/src/auth/session.ts` — the cookie holds a 256-bit
  base64url token, the database holds only its SHA-256 hash in `sessions.token_hash`;
  `createSession`, `loadSession`, `destroySession`, `loadUserRoleKeys` (role keys read
  per request) and `sessionCookieOptions` from `COOKIE_SECURE`/`COOKIE_SAME_SITE` with
  `httpOnly` always on. Expired rows are deleted on read, and a session of a
  deactivated account is no session at all.
- WP-M1-07: shared auth schemas `packages/shared/src/schemas/auth.ts` —
  `loginRequestSchema` (normalized e-mail, capped password length) and
  `meResponseSchema` (`id`, `email`, `locale`, role keys); unit tests for token, hash
  and cookie attributes, plus the integration spec for create/load/expiry/logout,
  inactive account and role keys.
- WP-M1-07b: auth HTTP layer in `apps/api/src/auth/` — `sessionPlugin.ts` decorates
  `request.user` from the `session` cookie (`onRequest`, roles read per request) and
  exports the preHandler `requireUser` (`401` `session_invalid`); `routes.ts` serves
  `POST /api/v1/auth/login` (Argon2id verify, decoy hash for unknown e-mails so the
  response time does not leak accounts, one `401 invalid_credentials` for unknown,
  wrong-password and deactivated logins, route-level rate limit `5` per minute and
  IP), `POST /api/v1/auth/logout` (`204`, session row deleted, cookie cleared) and
  `GET /api/v1/me`. `src/index.ts` owns the database pool (`onClose` releases it),
  registers the plugin and the routes, and maps thrown envelope errors to
  `{ code, params }` — `@fastify/rate-limit` throws the builder result, so the
  `429 rate_limited` body needs that handler. New API dependency `fastify-plugin`.
- `specs/01-rbac.md` §3.7: permission guard decisions for WP-M1-08 — the effective
  permission service (role union plus allows minus denials, denial wins), the
  per-request cache, `requirePermission` with OR semantics and its `401`/`403`
  codes, the `permissions` array in `/me`, and the probe route that is registered
  only when `NODE_ENV=test`.
- WP-M1-08 (plan): the legacy guard package was rewritten into the small-model
  format (`work-packages/m1/08-require-permission.md`) — it now names its four
  source files (guard, `/me` route, `index.ts`, shared `me` schema), the read set,
  the interfaces and the required test cases.
- WP-M1-09 (plan): the legacy admin UI package was rewritten into the small-model
  format and split. WP-M1-09 now covers only the admin user API; the role API,
  `usePermission`, the admin users UI and the admin roles UI become follow-up
  packages WP-M1-09b–WP-M1-09d.
- WP-M1-08: effective permissions and the only enforcement point of the API in
  `apps/api/src/auth/requirePermission.ts` — `loadEffectivePermissions` resolves
  the union of the role permissions plus the explicit `allow` rows of
  `user_permissions` and drops every key with a `deny` row (denial wins,
  `specs/01-rbac.md` §3.2) as two queries, returning sorted catalog keys through
  `isPermissionKey`. `effectivePermissions(request, database)` caches that promise
  on the request, so several guards in one request mean one resolution while a
  role or permission change still acts without a new login.
- WP-M1-08: `requirePermission(database, ...keys)` preHandler factory with OR
  semantics — `401 { code: 'session_invalid' }` without a session (authentication
  before authorization), `403 { code: 'forbidden', params: {} }` without a
  matching key, unknown keys never match. `permissionProbeRoutes` registers
  `GET /api/v1/_test/require-permission/:keys` (comma-separated keys) in
  `src/index.ts` only when `NODE_ENV=test`; verified `404` in development.
- WP-M1-08: `meResponseSchema` gains the effective `permissions` array, so login
  and `GET /api/v1/me` answer role keys plus permission keys; the integration spec
  `apps/api/src/auth/__tests__/requirePermission.integration.spec.ts` covers
  anonymous `401`, admin role, a user without any role `403`, OR semantics through
  an explicit allow, an explicit denial beating the whole admin union, the sorted
  `permissions` in `/me` and an unknown key.
- WP-M1-09: admin users API in `apps/api/src/admin/users.ts` —
  `GET /api/v1/users` answers user summaries with role keys,
  `POST /api/v1/users` creates a normalized account with an Argon2id hash and
  inserts the requested `user_roles` links in one transaction, and
  `PATCH /api/v1/users/:id` updates locale, active flag, password hash and role
  links. The routes are guarded by `user.read` or `user.write`; duplicate e-mail
  answers `409 email_taken`, unknown role keys answer `422 unknown_role_key`, and
  the last active `admin` cannot be deactivated or un-roled. Shared user Zod
  schemas live in `packages/shared/src/schemas/user.ts`; the integration spec
  `apps/api/src/admin/__tests__/users.integration.spec.ts` covers permission
  guards, list/create/update responses, duplicate handling and the last-admin
  lockout guard.
- WP-M1-09b: admin role API in `apps/api/src/admin/roles.ts` —
  `GET /api/v1/roles` (`role.read`) answers every role with `isSystem`, its sorted
  `permissionKeys` and `userCount`, `POST /api/v1/roles` creates a custom role
  (`is_system = false`) with de-duplicated catalog keys,
  `PATCH /api/v1/roles/:key` replaces the grant set and `DELETE /api/v1/roles/:key`
  removes an unused custom role (`role_permissions` cascade). The write routes are
  guarded by `role.write`; unknown permission keys answer
  `422 unknown_permission_key`, an existing or reserved key `409 role_key_taken`, a
  seeded system role `409 system_role_protected` (the service-level guard of
  `specs/01-rbac.md` §3.5, the DB trigger stays the backstop) and a role still held
  by users `409 role_in_use`. Shared role schemas live in
  `packages/shared/src/schemas/role.ts`, `specs/01-rbac.md` gained §3.8; the
  integration spec `apps/api/src/admin/__tests__/roles.integration.spec.ts` covers
  the guards, the seeded grant counts, create/replace/delete, the protected system
  roles and that a replaced grant set acts in `GET /api/v1/me` without a new login.
- WP-M1-10e: follow-up closure rule — `AGENTS.md` gained the section
  _Open follow-ups (mandatory closure)_ (a split creates its child WP files in the
  same commit, open items are collected with
  `git grep -n "Follow-up WP:\|Open question:" -- work-packages/<phase>/` before a WP
  starts and are implemented in numeric order before the next phase), `PLAN.md` §16
  gained the subsection _Current state and open backlog_,
  `work-packages/README.md` gained the `Open follow-ups` table as the backlog of
  record, and `docs/WP-TEMPLATE.md` gained the `status:` field plus the split-child
  handoff rule. This closes the hole that let WP-M1-09b–WP-M1-09d be overtaken by
  WP-M1-10, WP-M1-10b and WP-M1-10c.
- WP-M1-09c: admin users UI in `apps/web/src/admin/users-page.tsx` —
  `UsersPage` at route `/admin/users` lists users (e-mail, locale, active state,
  role keys) for `user.read` and offers a create form plus per-row editing
  (locale, active, role keys, optional new password) for `user.write`, using the
  role list of `GET /api/v1/roles` for the checkboxes. `apps/web/src/auth/usePermission.ts`
  adds `useMe` (query on `['me']`) and `usePermission` with the OR semantics of the
  server guard; hiding is cosmetic, the API stays the enforcement point. `apiFetch`
  parses the `{ code, params }` error body into `ApiError`, so `email_taken`,
  `last_admin` and the other codes map to `settings:admin.users.errors.*` keys.
  All page text lives in the `settings` namespace (de and en complete).
- WP-M1-09d: admin roles UI in `apps/web/src/admin/roles-page.tsx` — `RolesPage` at route
  `/admin/roles` lists roles (key, system or custom, permission count, user count) for
  `role.read`; `role.write` adds a create form (key plus the `PERMISSION_KEYS` checkbox
  grid), a per-row grant editor PATCHing `/api/v1/roles/:key` and a delete button, while
  seeded system roles stay read-only because the seed rewrites their grants. `apiFetch`
  answers `204 No Content` with `undefined` instead of throwing on the empty body, so
  `DELETE /api/v1/roles/:key` works. The role error codes map to
  `settings:admin.roles.errors.*` keys (de and en complete). The announced follow-up
  WP-M1-09e got its work-package document
  `work-packages/m1/09e-login-form-guard.md`.
- WP-M1-09e: session UI in `apps/web/src/auth` — `LoginForm` posts `/api/v1/auth/login` through
  `useMutation` + `apiFetch<MeResponse>` and writes the response into the `['me']` cache, so the
  guarded area swaps without a second round-trip; unknown e-mail, wrong password and a
  deactivated account all render the same `common:auth.errors.invalid_credentials` notice
  (no account enumeration), a `429` renders `rate_limited`. `LogoutButton` posts
  `/api/v1/auth/logout` and invalidates `['me']`, `['users']` and `['roles']`.
  `RequireSession({ children })` is the parent route of both `/admin/*` routes: loading text
  while `/me` is pending, the login form while it answers `401`, otherwise the children —
  cosmetic only, `requirePermission` stays the enforcement point. `App.tsx` shows the
  signed-in e-mail, the admin links and the logout button. All strings live in the `common`
  namespace under `auth.*` (de and en complete: 80 keys each).
- WP-M1-12: Playwright smoke E2E — `apps/web/e2e/auth.spec.ts` runs the phase 1 exit
  criterion "login as admin works" in Chromium, once with the German UI and once with the
  English one: login form of the seeded bootstrap administrator, the signed-in shell,
  `GET /api/v1/me` answering role `admin` plus `user.read`, and `/admin/users` with the
  seeded row and its role cell. `apps/web/playwright.config.ts` starts the API and the Vite
  dev server (only the dev server proxies `/api`; the nginx path is the Docker smoke test)
  on the E2E-only ports 3174/5174. `scripts/e2e-check.mjs` creates the throwaway database
  `stoerdesk_e2e_<run>` from `TEST_DATABASE_URL`, runs the migrations and both seeds against
  it, runs Playwright and drops it again; missing prerequisites produce one notice and a
  green gate locally, in CI (`CI=true`) they are an error. `npm run test:e2e` is the last
  gate of `npm run check`, and the `check` job installs Chromium with
  `npx playwright install --with-deps chromium` — no extra CI job, because that job already
  provides the Postgres-16 service. `E2E_CHROMIUM_PATH` selects a distribution browser in
  containers that cannot run the bundled build.
- WP-M1-13: UI layout shell — `apps/web/src/components/Shell.tsx` wraps the app in a sticky
  header (app title, signed-in account, logout button), a left navigation with the admin
  routes and a centred main area; the shell shows the login form while `/me` answers `401`.
  `App.tsx` renders the shell, the admin routes are nested below `/` so the shell wraps them,
  and the shell reuses the existing `common` keys (`app.title`, `auth.signedInAs`,
  `auth.links.*`) — no locale file changed.
- WP-M1-14: the base seed keeps an existing administrator untouched again — the bootstrap
  insert uses `onConflictDoNothing` on `users.email` and the status `created`/`existing` is
  decided by looking the user up before the insert. The Argon2id hash is only computed when
  a row is really inserted. The role link to `admin` is still repaired on every run.
- WP-M2-00: core object tables — migration `0002_core_object_tables` adds `objects`
  (user-input `object_no`, unique over `lower(object_no)`, address, contact, nullable
  `qr_token`, `external_id`, `active`, `notes`), `systems` (object FK with `ON DELETE
CASCADE`, type check over `BMA`/`LICHTRUF`/`RWA`/`EMA`/`SPRACHALARM`/`SONSTIGE`, own
  optional `qr_token`), `text_templates` and `text_template_translations` (composite key,
  `de`/`en` check) with the indexes of `specs/02-data-model.md` §4.6.
- WP-M2-00: demo seed `apps/api/src/db/seed-demo.ts` (`npx tsx src/db/seed-demo.ts`) —
  three example objects with one `BMA` system each plus the nine standard text templates
  from the new localized resource `STANDARD_TEXTS` in `packages/shared/src/seed/`;
  idempotent over the natural keys and never overwrites edits, the CLI prints counts only.
- `specs/02-data-model.md` is filled from `PLAN.md` §6 and reviewed: the object list is the
  maintained table, `object_no` is user input, unique case-insensitively, format
  `^[A-Z0-9][A-Z0-9_-]{0,31}$` (e.g. `12345_01`), tickets link by UUID foreign key, and
  external referencing (CSV, object API, stickers) uses `object_no`.
- WP-M2-01: object list CRUD API — `apps/api/src/objects/service.ts` serves
  `GET /api/v1/objects` (search plus the `active`/`city`/`systemType` filters),
  `GET /api/v1/objects/:objectNo`, `POST`, `PATCH /:objectNo` and `DELETE /:objectNo`
  (soft delete, `active = false`). Guards are `object.read`, `object.write` and
  `object.delete`; systems are synced by id; duplicate object numbers answer
  `422 object_no_taken`. The shared Zod schemas live in
  `packages/shared/src/schemas/object.ts`, and `specs/08-objects-api.md` §9.1 is filled
  from `PLAN.md` §11.
- WP-M2-02: QR tokens — `POST /api/v1/objects` now generates a 22-character
  `base64url` token, migration `0003_old_qr_tokens` adds `old_qr_tokens`
  (`token` unique, `expires_at`, object FK cascade),
  `POST /api/v1/objects/:objectNo/regenerate-qr` rotates it and retires the old
  token for 30 days (`blockOldToken: true` blocks it immediately), and the public
  `GET /api/v1/public/qr/:token` resolves current and retired active tokens for
  the web route `/m/:token`. `apps/api/src/objects/qr.ts` owns the routes and
  `generateQrToken()`; the object summary carries `qrToken`. The daily pg-boss
  cleanup and the demo-seed token backfill are WP-M2-02b.
- WP-M2-02b: QR token lifecycle — `apps/api/src/jobs/qr-cleanup.ts` adds
  `deleteExpiredQrTokens(database, now?)` (deletes `old_qr_tokens` rows with
  `expires_at <= now` and returns the count) and `startQrTokenCleanup(connectionString)`,
  which starts pg-boss, creates the queue `qr-token-cleanup`, registers the worker
  (one short-lived pool per job) and schedules it daily at `0 3 * * *`. The job is
  started only from the direct API start and stopped by an `onClose` hook, so
  `buildServer` and the test suite never create the pg-boss schema. The demo seed now
  generates a `qr_token` for every object it inserts and backfills an existing demo
  object whose token is `NULL`; a non-null token is never overwritten.
- WP-M2-03: printable QR stickers — `apps/web/src/features/objects/sticker-page.tsx`
  adds `StickerPage` at the guarded route `/objects/stickers`: the active objects of
  `GET /api/v1/objects?active=true` as a checklist (all selected by default, client-side
  search over number, name and city), an A6/A4 sheet format select and a print button
  (`window.print()`). Every card is an A6 sheet card (105 × 148 mm) with the QR of
  `<origin>/m/<qr_token>` (`qrcode.react`, SVG), the object name, the object number, the
  report call and the 112 notice of `PLAN.md` §2; an object with a `NULL` token prints
  without a QR. `apps/web/src/styles.css` carries the mm print geometry, the chosen
  format writes one `@page` rule, and header, nav, toolbar and checklist are
  `print:hidden`. No API route and no PDF endpoint were added — the browser print path is
  the primary path of `PLAN.md` §4/§11.
- WP-M2-04 (spec preparation): `specs/06-report-form.md` chapter 7 and
  `specs/02-data-model.md` §4.8–§4.11 are filled from `PLAN.md` §6/§10 and reviewed —
  the report endpoint contract, the ticket tables, the `ST-<year>-NNNN` counter and the
  note that the rate limit per IP and per QR token is the existing WP-M2-07.
- WP-M2-04 (work packages): the legacy `work-packages/m2/04-report-form-api.md` is
  rewritten into the small-model format and split into **WP-M2-04** (tables, counter,
  append-only trigger), **WP-M2-04b** (`04b-public-report-api.md`, public
  `POST /api/v1/public/tickets` with `client_uuid` idempotency) and **WP-M2-04c**
  (`04c-report-photo-upload.md`, photo files).
- WP-M2-04: ticket schema — migration `0004_ticket_tables` adds `tickets` (UUID v7
  `id`, `ticket_no` default `next_ticket_no()` producing `ST-<year>-NNNN` over the
  per-year row of `ticket_no_counters`, object FK `ON DELETE RESTRICT`, system FK
  `ON DELETE SET NULL`, checks over the `NEW`…`CANCELLED` statuses, the
  `low`…`critical` priorities and the `QR`/`INTERNAL`/`API` sources, `fault_template_keys`
  as `text[]`, the timestamps `reported_at`/`received_at`/`deadline_at`, `clock_skewed`,
  `suspected_spam`, the reporter contact fields and the unique `client_uuid`,
  `status_token` and `ticket_no`, plus the `parent_ticket_id` self FK), the append-only
  `ticket_events` (no `updated_at`, `payload` jsonb, trigger
  `ticket_events_is_append_only` raising `ticket_event_append_only` on a direct
  `UPDATE`/`DELETE` while the ticket's own `ON DELETE CASCADE` passes through
  `pg_trigger_depth() > 1`) and `ticket_photos` (unique `file_path` relative to
  `UPLOAD_DIR`, `image/jpeg`/`image/png` check). Drizzle tables `tickets`,
  `ticketEvents`, `ticketPhotos`, `ticketNoCounters` plus their inferred types in
  `apps/api/src/db/schema.ts`. `apps/api/src/db/__tests__/ticketTables.integration.spec.ts`
  proves the counter under five concurrent inserts, the unique `client_uuid`, the checks,
  the append-only rule, the `RESTRICT`/`SET NULL` behaviour and the cascade. No route,
  no service and no shared schema yet — that is WP-M2-04b and WP-M2-04c.
- WP-M2-04b: public report endpoint — `POST /api/v1/public/tickets` (no authentication)
  in `apps/api/src/tickets/report.ts` with the request/response schemas
  `publicReportRequestSchema`, `publicReportContactSchema`,
  `publicReportResponseSchema` and `faultTemplateKeySchema` in
  `packages/shared/src/schemas/ticket.ts`. The QR token travels in the body and must
  resolve to an **active** object — an unknown, inactive or retired token answers
  `404 qr_token_not_found`. `201` for a new report, `200` with the existing ticket for a
  repeat of the same `client_uuid` (`ON CONFLICT DO NOTHING` over the unique index, so an
  offline outbox replay never creates a second ticket). `422 report_text_required`
  without text and template keys, `422 contact_required` without phone and e-mail,
  `422 system_not_found` for a system of another object, `400 invalid_request` with
  `params.fields` outside the schema. `reported_at` is the device time unless it deviates
  from server time by more than ten minutes — then `reported_at = received_at` and
  `clock_skewed = true` — and `deadline_at` is that base plus 72 h. `status_token` is
  generated with the ticket by the existing `generateQrToken()`, `ticket_no` comes from
  the `next_ticket_no()` column default, and one append-only `created` event
  (`actor_kind = 'public'`, payload with locale, source, template keys and text length)
  is written in the same transaction. No photo field (WP-M2-04c) and no per-IP or
  per-token rate limit (WP-M2-07).
- WP-M2-04c: report photo upload — `apps/api/src/tickets/photos.ts` plus the
  `photoDataUrlSchema` and the `photos` array of `publicReportRequestSchema` in
  `packages/shared/src/schemas/ticket.ts`. `POST /api/v1/public/tickets` accepts up to
  **six** base64 data URLs (`data:image/jpeg;base64,…`) in the same JSON body; every photo
  is decoded, capped against `UPLOAD_MAX_BYTES` (default 10 MB) by its **decoded** size and
  verified by magic bytes — `FF D8 FF` for `image/jpeg`,
  `89 50 4E 47 0D 0A 1A 0A` for `image/png` — so the client claim never decides.
  `422 photo_limit_exceeded` for a seventh photo, `422 photo_too_large` for an oversized
  one, `422 photo_type_unsupported` when claim and bytes disagree; a rejected photo
  aborts the request before a single byte is written, so no half-filled gallery survives.
  Files land at `<UPLOAD_DIR>/tickets/<ticketId>/<file_uuid>.<ext>` (UUID v4 name, never an
  object number) and `ticket_photos` stores the path **relative** to `UPLOAD_DIR`, the
  detected MIME type and the decoded byte count; the route raises its `bodyLimit` to
  `6 × UPLOAD_MAX_BYTES × 1.4` and the response carries the real `photoCount`. The photo
  array of an idempotent repeat is ignored (§7.4). Reading a photo stays phase 10 — the
  uploads volume is never served.
- WP-M2-05: public report form UI — `apps/web/src/features/tickets/report-form-page.tsx`
  adds `ReportFormPage` at the unguarded top-level route `/m/:token`, outside the
  `Shell`/`RequireSession` tree. The page validates the token with `qrTokenSchema`,
  resolves current/retired active QR tokens through `GET /v1/public/qr/:token`, renders the
  prefilled object header, system select when the object has systems, localized fault chips
  from `STANDARD_TEXT_KEYS`/`STANDARD_TEXTS`, free text, contact fields, the 112 notice above
  the submit button and a confirmation with `ticketNo`, `deadlineAt`, `clockSkewed` and the
  `/s/<statusToken>` link. Submit posts `POST /v1/public/tickets` with one `clientUuid` per
  opened form, the current token (not a scanned retired token), selected catalog keys,
  locale and empty `photos` for now; client-side rules mirror the API `422`s before the
  round trip and known error codes map to `ticket:report.errors.*`.
- WP-M2-05b: report photo upload UI — `apps/web/src/features/tickets/image-compress.ts`
  adds `compressImage` (shortest edge capped at `MAX_PHOTO_DIMENSION = 1600`, JPEG
  `PHOTO_JPEG_QUALITY = 0.8`, `scaledSize` math and `photo_type_unsupported` for an
  undecodable or 0 px bitmap) and `photo-upload.tsx` adds `PhotoUpload` with previews,
  byte sizes, remove buttons and the client limit `MAX_REPORT_PHOTOS = 6`. The report form
  now holds `photos: string[]` in state, sends the data URLs in the same
  `POST /v1/public/tickets` body and maps `photo_limit_exceeded`, `photo_too_large` and
  `photo_type_unsupported` to `ticket:report.errors.*`; the confirmation shows
  `report.done.photoCount`. The real canvas path is proven by WP-M2-05c.
- WP-M2-06: public ticket status API — `apps/api/src/tickets/status.ts` adds
  `GET /api/v1/public/tickets/:token/status`, guarded by nothing but the unguessable
  `status_token`: an unknown or malformed token is `404 status_token_not_found`, a known one
  answers `200` with `ticketNo`, the current `status`, `reportedAt`, `deadlineAt` and the
  timeline. `packages/shared/src/schemas/ticket.ts` carries
  `PUBLIC_TICKET_EVENT_TYPES`, `publicTicketEventSchema` and
  `publicTicketStatusResponseSchema`, so only `created`, `work_order_set`, `accepted`,
  `acknowledged` and `closed` are read and the response never carries an event `payload`, an
  actor, contact data, the description or an internal comment. The page itself is WP-M2-06b.
- WP-M2-06b: public status page — `apps/web/src/features/tickets/status-page.tsx` adds
  `StatusPage` at the top-level route `/s/:token`, outside the `Shell`/`RequireSession` tree.
  The token is validated with `qrTokenSchema` before the request, `usePublicStatus(token)`
  reads `GET /v1/public/tickets/:token/status`, and the page shows the ticket number, the
  status as a badge whose colour is paired with the localized text label of
  `ticket:status.values.*` (never colour alone), the deadline and the timeline with the
  localized labels `ticket:status.events.*` plus the localized timestamps — in `de` and `en`.
  A malformed token renders `ticket:status.errors.invalidToken` without a request, an unknown
  one renders `ticket:status.errors.not_found`.
- WP-M2-07: report throttle — migration `0005_report_throttle` adds the append-only
  `report_throttle` table (one row per public report attempt: `ip` as `inet`, `qr_token`,
  `created_at`, indexed by `(ip, created_at)` and `(qr_token, created_at)`) and
  `apps/api/src/tickets/spam.ts` adds `recordReportAttempt`, `recentReportCount` (the higher of
  the per-IP and the per-token count inside the window) and `isReportSuspicious` (more than
  `SUSPICION_MAX` = 3 attempts inside `SUSPICION_WINDOW_MS` = 10 minutes) — the window is a
  `count(*)` in PostgreSQL because the stack has no cache and no Redis. No route consults it
  yet: the honeypot, the Altcha proof of work and the `tickets.suspected_spam` write are
  WP-M2-07b/07c/07d. The retention of the stored IP stays an open decision.
- WP-M2-07b: Altcha captcha primitives — `apps/api/src/tickets/altcha.ts` adds
  `createAltchaChallenge` (SHA-256 proof of work, difficulty `ALTCHA_MAX_NUMBER`, the
  expiry carried inside the `salt` so one solved payload cannot be replayed forever),
  `verifyAltchaPayload` (recomputes `hash(salt + number)`, the HMAC signature over that
  hash and the expiry) and the unauthenticated
  `POST /api/v1/public/altcha/challenge`; `apps/api/src/index.ts` registers it next to the
  other public routes. `ALTCHA_SECRET` empty means "no captcha configured" and answers
  `404 altcha_not_configured`. `altcha-lib` is held on its v1 major: its challenge format
  `{ algorithm, challenge, salt, signature, maxnumber }` is the one the `altcha` web
  component answers with. Nothing on the create path reads it yet — that is WP-M2-07c.
- WP-M2-07c: spam decision on the report create path — the public report request accepts
  the optional honeypot field `website` and an optional Altcha `verification` payload, and
  `apps/api/src/tickets/report.ts` records every new public report attempt in the
  `report_throttle` table before writing the ticket. A filled honeypot is stored with
  `tickets.suspected_spam = true`; a suspicious report (more than three attempts per IP
  or QR token inside 10 minutes) asks for the proof of work with `400 captcha_required`,
  stores it as suspected spam when no captcha is configured and otherwise accepts only a
  verified `altcha-lib` payload. An idempotent repeat returns the existing ticket before
  the spam decision, so replay does not create or flag a second ticket.
- WP-M2-07d: honeypot and Altcha widget in the public report form — the form at `/m/:token`
  now sends the hidden `website` honeypot with every report (invisible for a human: no
  label, no tab stop), and only a `400 captcha_required` makes the Altcha widget appear:
  the challenge is fetched from `POST /api/v1/public/altcha/challenge`, the solved proof
  of work travels back in the `verification` field of the next attempt, and the widget
  itself is loaded on demand — a reporter of a normal report never sees a captcha.
  The `altcha` web component is held on its v3 major, which answers the v1 challenge
  format of `altcha-lib`.

### Changed

- Governance split: `AGENTS.md` now regulates only the agent behaviour and the
  workflow — plan anchor, before-you-start checklist, work-package discipline, the
  follow-up closure rule, the quality-gate and CI-after-push behaviour, commits,
  version tags, the mandatory todo list, structure discipline and the security rules.
  Every project-specific fact moved into `PLAN.md`: the i18n mechanics (§3.1), the
  coding conventions beyond the stack table (§4.1), the data model lessons (§6.1), the
  six `check` gates with the WP-M1-01 deviation (§18.1), the development commands for
  database, migrations, seeds and E2E (§18.2) and the CI run-name, publish-dispatch,
  version-tag and credential-store mechanics (§18.3); `PLAN.md` §16 names
  `docs/REPO-MAP.md` as the only inventory of the code. The section references of the
  removed `AGENTS.md` chapters were repointed to `PLAN.md` in
  `specs/02-data-model.md`, ADR-0002, `docs/REPO-MAP.md`, `apps/web/src/lib/api.ts`,
  `.github/workflows/check.yml` and `scripts/e2e-check.mjs`.
- WP-M1-12: `apps/web/src/i18n/index.ts` reads the stored language preference
  (`i18nextLng`, only `de`/`en`) as the initial language, with `de` still the default and
  the reference locale and a broken storage never breaking init. Without it the `en` bundle
  was unreachable in a running app, so no English test could exist; a later language
  switcher UI writes exactly this key. `npm run check` gained the sixth gate `test:e2e`, and
  the `check` job step is named `Quality gates (typecheck, lint, tests, i18n, wp, e2e)`.
- WP-M1-10f (completed): `build.yml` closes the CI naming rule — `permissions:
actions: write`, the job `Resolve version tag` gained the guarded step
  `Name the run after the version` (`gh api --method PATCH` renames the run to
  `publish <version>`, `continue-on-error: true`), the publish jobs are named
  `Publish <service> image <version>`, the step `Build and push image` and the new
  `Write image summary` step write image names, tags, version, source SHA and
  source run URL into the job summary. `AGENTS.md` states the run-naming rule and
  `CONTRIBUTING.md` speaks of `publish images`.
- WP-M1-10f (partial): CI runs are self-describing now. `check.yml` gained
  `run-name: check · <ref> · <event>` and the step names `Quality gates
(typecheck, lint, tests, i18n, wp)` and `Build web and API artifacts (no publish)`.
  `.github/workflows/build.yml` is displayed as **publish images** instead of
  `build and push` and gained `run-name: publish images · <event> · <source branch>`.
  The first attempt used `${{ substring(github.sha, 0, 7) }}` in both labels — GitHub
  Actions has no `substring()` function, so the push produced four runs named after the
  workflow file that failed instantly with zero jobs; the labels carry no short SHA now.
  GHCR image names and the tag set are unchanged; the run rename to `publish <version>`,
  the publish job/step names and the image run summary are still open
  (see `work-packages/m1/10f-ci-run-naming.md`).
- CI housekeeping (no work package): the `playwright` job of `check.yml` was removed —
  the repository has no `playwright.config` and no E2E spec, so the job only re-ran the
  web unit tests with an installed Chromium. It comes back with WP-M1-12. All publish
  runs now share one serialising concurrency group (`publish-queue`), so a slower build
  of an older commit can no longer overwrite `latest`.
- WP-M1-10g (superseded by WP-M1-10h): attempted to version the run names by letting
  `check.yml` rename its own run through `gh api --method PATCH
actions/runs/<run_id>`. It never took effect: the run stayed `check · main · push` and
  the publish run inherited that plain title as `publish check · main · push · main`
  (runs 41034256724 and 41034380131). Two wrong assumptions — see WP-M1-10h.
- WP-M1-10h: the quality gates hang on the version tag. **A workflow run cannot be renamed
  at all**: the REST reference of the workflow-runs API lists rerun, cancel, delete, logs,
  approvals and timing only, and the PATCH call of WP-M1-10g answers `404` (hidden by
  `continue-on-error: true` since WP-M1-10f). A label therefore has to be right when the run
  starts, and the only payload carrying the version is a tag push — which `git push
--follow-tags` produces for every commit. `check.yml` triggers on
  `push: tags: ['v[0-9]*']` (plus `pull_request` and `workflow_dispatch`) instead of
  `push: branches: [main]`, its `run-name` is `github.ref_name` so the run is titled
  `v0.0.NN`, and the dead `Resolve version tag` rename job plus `actions: write` are gone.
  `build.yml` drops the `branches: [main]` filter of its `workflow_run` trigger, gates the
  version job on `workflow_run.event == 'push'` so pull request runs never publish, and its
  `run-name` is `publish <title of the calling check run>` → `publish v0.0.NN`. Consequence:
  a commit pushed without its tag gets no quality-gate run, so the one-tag-per-commit rule
  is now a build precondition in `AGENTS.md`.
- WP-M1-10i: the publish run label says what is new. A `workflow_run` payload only carries
  the title of the calling run, so `publish v0.0.NN` was the ceiling, and no Actions
  expression can turn `head_commit.message` of a tag push into one line (that field is the
  whole multiline commit message — verified through the Actions API: the runs of `v0.0.49`
  and `v0.0.50` carry the commit SHAs `b13e9d4`/`ca4c948` as `head_sha`, while the annotated
  tag objects are different SHAs). The green `check` run of a tag now ends with the job
  `Dispatch publish run`, which posts a `workflow_dispatch` event for `build.yml` with the
  inputs `version`, `notes` (the commit subject), `source_run` and `mode=check` — the only
  payload that carries usable free text. `build.yml` triggers on `workflow_dispatch` alone,
  titles itself `publish <version> · <notes>` (manual runs:
  `publish <version> · manual · <ref>`), checks that the tag at HEAD equals the requested
  `version`, and moves `latest` only for `mode=check`. Side effect: the empty `publish
images` runs of finished pull request runs are gone, and the check↔publish link now lives
  in the `source_run` input and both job summaries. Lesson from the first push: a job
  without `runs-on` fails the Actions schema and with it the whole file — the run then has
  zero jobs, is titled with the workflow path and ignores its trigger filters, so one
  `git push --follow-tags` produced two failed `check` runs. `js-yaml` only validates YAML
  syntax, so the fix push was preceded by a `js-yaml` pass over both workflows that asserts
  `runs-on`, a non-empty `steps` list and resolvable `needs` for every job.
- WP-M1-11: `docs/REPO-MAP.md` is English and current through phase 1, which closes the
  deviation note that WP-M1-10, WP-M1-10c and WP-M1-10d carried. The tree now shows the
  folders phase 1 actually created (`apps/web/src/{admin,auth,lib,routes}`,
  `apps/api/src/{admin,auth,config,notifications}`) and marks the folders that are still
  empty on purpose (`components/`, `features/*`, `tickets|objects|oncall|stats|jobs`). The
  module table gained the rows that were missing: `apps/api/src/index.ts` (`buildServer` with
  the `{ code, params }` error envelope and `/api/v1/health`),
  `packages/shared/src/schemas/user.ts`, `packages/shared/src/i18n/t.ts`,
  `apps/web/src/routes/index.tsx`, `apps/web/src/App.tsx` and `main.tsx`,
  `apps/api/drizzle.config.ts`, `apps/api/scripts/copy-migrations.mjs`, the Husky hooks with
  the one-tag-per-commit rule, the three Compose overrides, the ADR files and the governance
  documents. The map is 168 lines (limit 200) and the legacy WP document
  `work-packages/m1/11-repo-map.md` was rewritten into the small-model format.
- WP-M1-10d: `docs/DECISIONS.md` and the ADRs are English, as the language rule of
  `AGENTS.md` requires. The index titles the records "Monorepo with npm workspaces" and
  "UUID v7 as the database primary key", the template block asks for `Status`, `Date` and
  `Stakeholders` above `Context`, `Decision`, `Alternatives` and `Consequences`, and
  ADR-0002 keeps every technical statement: Postgres 16 has no `uuidv7()` (that arrives
  with Postgres 18), migration `0000_base_tables` provides `gen_uuid_v7()` (48-bit
  millisecond timestamp, version 7, RFC 9562 variant bits, random remainder) written as
  `CREATE OR REPLACE` and declared `VOLATILE`, the four rejected alternatives, and the
  caveat that the ticket timeline follows event timestamps and event sequences rather than
  IDs. The English slugs and the ADR-0001 translation had already landed in the
  work-in-progress commit `b573fb5`, so the German remainder was the index, the template
  and ADR-0002. `docs/REPO-MAP.md` shrinks its deviation note to the map itself, which
  WP-M1-11 normalizes.
- WP-M1-10c: the four `docs/` placeholders `ARCHITECTURE.md`, `COMPLIANCE.md`,
  `GLOSSARY.md` and `I18N.md` are English now, as the language rule of `AGENTS.md`
  requires. `ARCHITECTURE.md` separates what is live (`/api/v1/health`, the auth
  routes, the admin users routes) from what is still planned (public report route,
  ticket state machine, notification outbox, pg-boss jobs, Dexie working copy), the
  permission source of truth is corrected to `packages/shared/src/permissions.ts`,
  and the locale table states `de` as default and reference while `en` must be
  complete.
- WP-M1-10: `CONTRIBUTING.md`, `SECURITY.md` and `CODE_OF_CONDUCT.md` are English
  now, and `CODE_OF_CONDUCT.md` carries the full Contributor Covenant 2.1 text
  instead of a paraphrase; the last German step name in
  `.github/workflows/check.yml` is English too. `SECURITY.md` no longer points at a
  `SECURITY_CONTACT` variable that `.env.example` does not define — the reporting
  channel is the operator of the instance or a private GitHub report.
- WP-M1-08: `POST /api/v1/auth/login` answers the same user object as
  `GET /api/v1/me` — the shared `meResponseSchema` now requires `permissions`, so
  the UI needs no second round trip to know what to show.
- Language rule tightened: code, comments, test names, commit messages and
  developer documentation are English; the app stays multilingual (`de` default,
  `en` complete) and UI text uses i18n keys only.
- README and `AGENTS.md` switched to English.
- Default image build context is now the local checkout (`.`). Deployment panels
  that clone the repository themselves set `IMAGE_BUILD_CONTEXT` to the Git URL.
- The web container no longer waits for a healthy API, so the UI is reachable
  even while the API is starting or failing.
- The emergency notice uses 112 only; no other emergency number is part of the
  product text.
- The production stack publishes only the web port (`WEB_PORT`): `api` and `db`
  stay on the internal `backend` network, so they cannot collide with ports of
  other projects on the same Docker host. `API_PUBLISHED_PORT` and
  `API_BIND_ADDRESS` apply to the debug override only.

### Fixed

- WP-M1-14: the base seed broke the contract of `work-packages/m1/06-seeds-base.md` §4 in
  commit 82a9fc7 — a re-run overwrote the `password_hash` of an existing administrator,
  although the seed must never reset a changed password, and the status was derived from
  `inserted.length === 1`, which PostgreSQL `RETURNING` also reports for an upsert, so the
  second run claimed `created` instead of `existing`. The failing assertion in
  `seed-base.integration.spec.ts` encoded the specified behaviour. This fixes the red
  `check` runs v0.0.58 … v0.0.61.
- WP-M0-05: the Docker smoke test no longer treats the internal `expose: 3000`
  of the API as a published host port; `docker compose port` reports it as
  `:0`, so only a real non-zero public port fails the guard.
- WP-M0-05: version tags are now annotated, so `git push --follow-tags`
  actually publishes them and the `build and push` workflow can resolve the
  version of the pushed commit.
- WP-M1-10b: the three GitHub issue forms in `.github/ISSUE_TEMPLATE/` render as
  forms again — they had no closing front-matter delimiter and no nested
  indentation for `attributes` and `validations`, so GitHub showed them as plain
  text. The emergency notice in `bug.md` and `feature.md` names 112 only (no 110),
  and `.prettierignore` keeps Prettier from rewriting the form YAML.

### Deviations

- WP-M1-01: `npm run check` uses per-workspace typechecks instead of a single
  `tsc --noEmit` across all packages (see `AGENTS.md`); ESLint uses a flat config
  (`eslint.config.js`) instead of `.eslintrc.cjs`.
- WP-M1-03: the first migration uses drizzle-kit's number `0000` instead of
  `0001`; exactly one migration exists.
- WP-M0-04: the acceptance command `sh scripts/docker-smoke.sh` was not executed
  locally because the development container has no Docker; verified with `sh -n`
  and `npm run check`, the CI job `docker-smoke` runs the real smoke test.
- WP-M1-10b: while adding the `.github/ISSUE_TEMPLATE/` entry, the German
  drizzle-kit comment in `.prettierignore` was translated — `AGENTS.md` requires
  English everywhere.
- WP-M1-10c: the glossary names each term in English and keeps the German UI label in
  parentheses (`Objekt`, `Anlage`, `Rolle`), so the vocabulary of the German product
  text stays findable from English developer documentation.
- WP-M1-12: the bundled Playwright Chromium is a glibc build and cannot start in this
  Alpine (musl) development container, so the two tests ran locally against the
  distribution browser — `E2E_CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e`
  printed `2 passed` after `prepared throwaway database …` and `dropped throwaway
database …`. Without that variable the runner prints its skip notice and `npm run check`
  stays green, which is why the CI job installs the browser and reports the real run.
- WP-M1-12: the legacy WP document `work-packages/m1/12-smoke-e2e.md` was rewritten into
  the small-model format, and its four-line task list gained the ten-line stored-language
  read in `apps/web/src/i18n/index.ts`: the acceptance demands an EN test, and the app had
  no path to the `en` bundle.

### Fixed

- The ticket detail dropdown of WP-M4-07 now performs body-less workflow actions
  (review, assign, accept, close) on confirmation and navigates back to the ticket
  list via "`Zurück zur Liste`": the redesign left them without any working target,
  so the phase-4 and phase-5 E2E exit criteria (WP-M4-01, WP-M5-08) were red in CI
  for runs v1.0.25 … v1.0.29 against a real database and Chromium. The E2E specs
  now drive the dropdown menu instead of the removed buttons
  (`select[name="ticketAction"]`, payload inputs addressable via their `name`
  attributes). `npm run check` is green end to end.

### Not implemented (by design)

- All domain logic (tickets, objects, on-call, notifications, UI).
  Implementation happens only as a work package from `work-packages/` — so far
  WP-M1-01 to WP-M1-12 (foundation, base data model, RBAC, seeds, session core,
  the auth HTTP layer, the permission guard, the admin users and roles APIs with their
  UI, the CI chain and the Playwright smoke test) are
  implemented.
