# StörDesk — Implementation Plan

Status: binding working plan · Version: 2.0 · Audience: coding agents and developers

This file is the single entry point for the project. It replaces the raw
`PFLICHTENHEFT.md` that was never committed. Detailed slices live in `specs/`;
implementation units live in `work-packages/`.

## 0. Reading order and source of truth

Every agent reads, in this order:

1. `PLAN.md` — scope, stack, phases, current state, open decisions.
2. `specs/README.md` and the spec chapter referenced by the current work package.
3. `work-packages/README.md` and the current work package.
4. `docs/REPO-MAP.md` — where the code lives.
5. `docs/DECISIONS.md` — accepted architecture decisions.

Rules:

- Implementation happens only inside a work package (WP).
- One WP = one model run = one commit.
- A WP reads only the files and spec sections named in the WP.
- If a WP needs more than 4 source files or more than 30k tokens of context,
  stop and split it before writing code.
- If the plan is ambiguous, add an ADR or ask; do not invent requirements.

## 1. Product scope

StörDesk is a malfunction desk for buildings and technical safety systems
(fire alarm, nurse call, smoke vent, burglar alarm, voice alarm, others).

Customers and staff report malfunctions in seconds via QR code or an internal
form. The office creates the external work order (AA/SA number), the on-call
technician accepts, acknowledges and documents the fix. The system measures
response times, frequencies and deadline compliance. An on-call calendar decides
who is notified first.

In scope:

- installable, offline-capable PWA for reporters and internal users,
- ticket workflow with immutable audit trail,
- objects and systems with QR codes and printable stickers,
- on-call calendar with confirmations and swaps,
- 72-hour timeline, escalation rules and pg-boss jobs,
- notifications through external systems only,
- dashboard, statistics, CSV export and REST API.

Out of scope for phase 1:

- billing, time tracking, stock or warehouse management,
- native apps,
- replacing the external work-order system (only the AA/SA number is stored),
- emergency dispatch or alarm transmission.

## 2. Emergency notice

StörDesk accepts malfunction reports only. It is never an emergency call path.

The notice on the report form and on every printed QR sticker is exactly:

> **Bei Brand oder Gefahr: Notruf 112. Dieses Formular ersetzt keinen Notruf.**

The notice is multilingual through i18n. The German text above is the reference;
the English text must carry the same meaning. No other emergency number is part
of the product text.

## 3. Language and error contract

- Code, identifiers, comments, JSDoc, test names, commit messages, logs and
  developer documentation are English.
- User-facing text is multilingual: German is the default and reference locale,
  English must be complete.
- UI text is never hard-coded. Use i18n keys only.
- API and logs never contain translated text. Errors use `{ code, params }`.
- Seed data and standard text templates are localized resources, not German
  string literals in code.

### 3.1 i18n mechanics

- Web namespaces: `common`, `errors`, `validation`, `ticket`, `object`, `oncall`,
  `stats`, `settings`.
- `de` is the default and the reference locale, `en` must be complete.
- No literal strings in JSX: the ESLint rule `i18next/no-literal-string` is active.
- A new namespace file must be registered in `apps/web/src/i18n/index.ts`,
  otherwise `npm run i18n:check` fails. That check also verifies de/en key parity
  and that every key referenced in `apps/web/src` exists.
- Server text goes through the shared `t()` of `packages/shared/src/i18n/t.ts`
  (`server.{de,en}.json`, `seed.{de,en}.json`); API errors and logs stay English.

## 4. Architecture and stack

| Area            | Decision                                                                                                  |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| Language        | TypeScript strict everywhere                                                                              |
| Monorepo        | npm workspaces: `apps/web`, `apps/api`, `packages/shared`                                                 |
| Web             | React 19 + Vite + `vite-plugin-pwa` + Tailwind + TanStack Query + React Router                            |
| Offline storage | IndexedDB via Dexie                                                                                       |
| API             | Node.js 22 LTS, Fastify 5, Zod 4, Pino                                                                    |
| Database        | PostgreSQL 16, Drizzle ORM and `drizzle-kit`                                                              |
| Files           | Photos in the `/data/uploads` volume, metadata in PostgreSQL                                              |
| Auth            | Session cookie (httpOnly, SameSite=Lax), Argon2id password hashing                                        |
| Jobs            | `pg-boss` in PostgreSQL; no Redis                                                                         |
| Push            | Web Push with VAPID; external Matrix, Signal, ntfy, SMTP, Telegram                                        |
| Deployment      | Docker Compose: `db`, `api`, `web`, optional `backup`; migrations run inside the `api` container at start |
| Network         | internal `backend` network; only `web` publishes a host port, `api` and `db` stay unpublished             |
| Reverse proxy   | nginx in the web container; TLS is provided by an external proxy                                          |
| Tests           | Vitest for unit/integration, Playwright for E2E                                                           |

Binding technical choices for decisions that were still open:

- **Password hashing:** `@node-rs/argon2` (prebuilt binaries, works on Alpine).
  The alternative `argon2` is documented in `docs/DECISIONS.md` if the native
  build is preferred.
- **Time zones:** `date-fns-tz`. All timestamps are stored in UTC, displayed in
  `Europe/Berlin`; on-call slots are calculated in local time and stored as UTC.
- **QR stickers:** printable HTML view with `@media print` and A6/A4 page sizes.
  A real PDF download (`pdf-lib`) is optional and only added if needed.
- **OpenAPI:** `@fastify/swagger`, `@fastify/swagger-ui` and
  `fastify-type-provider-zod`.
- **Messengers:** integrations only. StörDesk never ships Matrix, Signal, ntfy,
  SMTP or Telegram containers.

### 4.1 Coding conventions

These are the project conventions a work package has to follow; the agent workflow
around them is in `AGENTS.md`.

- TypeScript strict, no `any` (ESLint warning), no untyped code. Web and API keep
  their own `tsconfig.json` because they need different `lib` sets.
- Code, identifiers, comments, JSDoc, test names, error and log messages, commit
  messages and developer documentation are English (§3); the repository
  documentation (README, `AGENTS.md`, `docs/`) is English too.
- Errors are `{ code, params }` — never translated text in a log or an API payload.
- Logging is Pino, structured, never PII in plain text.
- Money amounts: none. StörDesk tracks no amounts, no stock and no time
  (§1) — do not copy amount or stock patterns from other projects.
- IDs are UUIDs with UUID v7 as the database default, never sequential numbers
  (§6, ADR-0002).
- Timestamps are `timestamptz` in UTC; the server clock is authoritative (§15).
- User-facing web text only through i18n keys (§3.1).
- Tests: Vitest (one project per workspace) for unit/integration, Playwright for
  E2E.

## 5. Roles and permissions

`reporter_anon` is a public capability, not a database role. Authenticated users
have one of five roles:

| Role                | Purpose                                                                         |
| ------------------- | ------------------------------------------------------------------------------- |
| `reporter_internal` | Staff member; creates reports and sees own tickets                              |
| `office`            | Reviews tickets, sets AA/SA, assigns, offers, closes, maintains objects         |
| `oncall`            | Accepts, declines, acknowledges assigned or offered tickets; manages own shifts |
| `manager`           | Read access to everything, statistics, export, escalation oversight             |
| `admin`             | Users, roles, groups, settings, on-call planning, channels, API keys            |

Effective permissions are the union of role permissions minus explicit user
denials. Permission keys are constants in `packages/shared/src/permissions.ts`
and are validated by typecheck and tests.

Permission categories:

- `ticket.*`: read, create, review, assign, offer, claim, accept, decline,
  acknowledge, close, reopen, cancel, comment, photo.read, photo.write
- `object.*`: read, write, delete, regenerate_qr, import
- `oncall.*`: read, plan, confirm, swap, admin
- `user.*`, `role.*`, `settings.*`, `apikey.*`
- `stats.read`, `stats.export`, `notification.read`, `notification.write`

The full role-permission matrix is maintained in `specs/01-rbac.md`.

## 6. Data model

All domain tables use UUID v7 primary keys and UTC timestamps. Exceptions:
join tables use composite keys, `settings` uses `key`, and event tables are
append-only.

Core tables:

- `objects` — object number, name, address, contact, `qr_token`, `external_id`,
  active, notes
- `systems` — object reference, type (`BMA`, `LICHTRUF`, `RWA`, `EMA`,
  `SPRACHALARM`, `SONSTIGE`), label, optional own `qr_token`
- `contracts_refs` — optional object-level AA/SA default and service level
- `tickets` — readable `ticket_no`, object/system, status, priority, title,
  description, `reported_at`, `received_at`, source, reporter data, work-order
  type/number, assignment data, response timestamps, `client_uuid`, flags,
  `parent_ticket_id`, `deadline_at`
- `ticket_events` — append-only audit log with actor, type, payload
- `ticket_photos` — file path, MIME type, size, dimensions, uploader
- `ticket_pauses` — wait reason, start/end, actor
- `text_templates` and `text_template_translations` — localized standard texts
- `users`, `groups`, `user_groups`, `sessions`, `api_keys`
- `notification_channels`, `push_subscriptions`, `outbox`
- `settings`
- `oncall_pools`, `oncall_shifts`, `oncall_swap_requests`, `oncall_events`
- `old_qr_tokens` — redirects for regenerated QR codes

Required fields beyond the raw specification:

- `tickets.reviewed_by_user_id`, `tickets.review_started_at`
- `tickets.offered_to_user_id`, `tickets.offer_escalated_at`
- `tickets.status_token` for the public status page
- `tickets.ticket_no` generated by a concurrency-safe yearly counter
- `ticket_pauses` for the 72-hour timeline
- `ticket_events` and `oncall_events` protected against UPDATE/DELETE by trigger

Indexes at minimum:

- `tickets(object_id, reported_at)`
- `tickets(status)`
- `tickets(assigned_user_id, status)`
- `tickets(client_uuid)` unique
- `objects(object_no)` unique, `objects(qr_token)` unique
- `oncall_shifts(pool_id, start_at, end_at)`

### 6.1 Data model lessons

- **No stock logic.** StörDesk manages no stock and no amounts (§1); an import or
  sync never changes a stock-like quantity.
- **Changes stay traceable.** Event tables are append-only: a correction is a new
  event, never an edit of an old one, and a database trigger blocks `UPDATE` and
  `DELETE` on `ticket_events` and `oncall_events` (§15 Audit).
- **Quarantine.** Import or sync errors that cannot be resolved automatically are
  isolated as quarantine rows and never block the processing of the remaining rows
  (§11 CSV import, §10 spam and duplicate handling).

## 7. Ticket workflow

Status values are English in code, database and API; German and English labels
come from i18n.

`NEW` → `IN_REVIEW` → `WORK_ORDER_CREATED` → (`OFFERED` | `ASSIGNED`) →
`ACCEPTED` → `ACKNOWLEDGED` → `CLOSED`

Additional status: `CANCELLED`.

`DECLINED` is an event, not a persisted status. A decline returns the ticket to
the previous distribution step.

Rules:

1. **Create:** QR or internal form creates `NEW` and a `created` event.
   Notification to `office`.
2. **Review:** office sets `IN_REVIEW` and `reviewed_by_user_id`. Other office
   users see who is working on it.
3. **Work order:** office enters AA/SA type and number. Mandatory before the
   next step. Event `work_order_set`.
4. **Distribution:** office can assign directly, offer to the on-call person or
   group, or technicians can claim from the pool.
   - `ASSIGNED` for a direct assignment.
   - `OFFERED` for an offer. The current on-call person is notified first; after
     the configured timeout the whole group is notified.
   - Claiming is atomic: `UPDATE ... WHERE status = 'OFFERED'`; the loser gets a
     conflict response.
5. **Accept:** technician accepts; set `accepted_at` and `first_response_at`.
6. **Decline:** reason is mandatory (min. 5 characters). Event `declined` with
   reason. Ticket returns to `OFFERED` or `WORK_ORDER_CREATED`.
7. **Acknowledge:** technician enters a mandatory note, optional photos and a
   result (`fixed`, `partially_fixed`, `follow_up_required`, `no_fault_found`).
   Set `acknowledged_at`; timeline stops.
8. **Close:** office closes; set `closed_at`.
9. **Reopen:** office or manager reopens with a reason; event `reopened`.
10. **Cancel:** office or admin cancels with a reason; event `cancelled`.

All transitions run through `transitionTicket(ticketId, event, actor, payload)`.
The function checks role, current status and guards, and writes the event in the
same database transaction. Invalid transitions return HTTP 409.

Critical priority shortens deadlines and triggers immediate escalation.

## 8. On-call calendar

Admins plan shifts per pool. Technicians confirm, decline or request a swap.
The calendar decides who is notified first when a ticket is offered.

Defaults:

| Setting                               | Default          |
| ------------------------------------- | ---------------- |
| `oncall.week_start_weekday`           | Monday (1)       |
| `oncall.start_time`                   | 07:00 local time |
| `oncall.duration_days`                | 7                |
| `oncall.swap_requires_admin_approval` | true             |
| `oncall.escalate_to_group_after_min`  | 10               |
| `oncall.reminder_unconfirmed_h`       | 24               |
| `oncall.unfilled_warning_days`        | 14               |

Slots are calculated in `Europe/Berlin` local time, not as fixed 168-hour
blocks, so DST changes remain correct. Start and end are stored as UTC.

Shift states: `DRAFT` → `PLANNED` → `CONFIRMED` | `DECLINED` |
`SWAP_REQUESTED`; a slot without a technician is `UNFILLED`.

Swap rules:

- A technician can ask one colleague or the whole pool.
- The first acceptance wins atomically.
- With admin approval enabled, the slot changes only after approval.
- The original technician remains responsible until approval.
- A confirmed shift can be swapped until it starts; after that only an admin can
  reassign it (partial handover is phase 2).

Ticket coupling:

- The current on-call person is the technician of the confirmed shift covering
  now. A merely planned shift also counts, but the admin receives a warning.
- Offers go to the on-call person first. After the timeout or a decline they go
  to the group.
- Without an on-call person, the offer goes to the group immediately and the
  admin is warned.
- The dashboard tile shows name, phone number and shift end, or a red
  "on-call not staffed" banner.

## 9. Timeline and escalation

Every ticket shows a horizontal bar from `reported_at` to `deadline_at`
(default 72 h, configurable per priority).

- Markers: report, office review, work order, accept, acknowledge.
- Colors: green to 50 %, yellow 50–80 %, orange 80–100 %, red after the deadline.
- The bar stops at `ACKNOWLEDGED`.
- A wait reason can pause the clock; pauses are stored in `ticket_pauses` and
  reported separately in statistics.
- Lists show a mini timeline and sort by least remaining time.
- The client updates every minute; the server is authoritative.
- pg-boss timers calculate thresholds and trigger escalation notifications.

Default escalation rules:

| Event                                     | Default                  | Action                                |
| ----------------------------------------- | ------------------------ | ------------------------------------- |
| `NEW` without review                      | 15 min (critical 5 min)  | remind office, then manager           |
| `WORK_ORDER_CREATED` without distribution | 30 min                   | remind office                         |
| `OFFERED` without claim                   | 20 min (critical 10 min) | repeat to group, then manager         |
| `ASSIGNED` without accept                 | 15 min                   | return to office                      |
| 80 % of total deadline                    | —                        | notify assignee and manager           |
| total deadline exceeded                   | —                        | escalate to manager, ticket turns red |

All rules run 24/7 and are configurable per priority.

## 10. Report form and offline

Public route: `/m/<qr_token>`. Status page: `/s/<status_token>`.

Fields:

- object (prefilled from QR, searchable internally),
- system (prefilled for system QR codes),
- fault type from localized standard templates (multi-select) and/or free text,
  at least one required,
- up to 6 photos, compressed client-side to max. 1600 px and JPEG quality 0.8,
- contact name plus phone or e-mail (at least one),
- priority only for internal users; QR reports start as `normal`.

Behaviour:

- one screen, large send button, mobile-first,
- confirmation page with ticket number and status link,
- offline: store report and compressed photos in Dexie `outbox` with
  `client_uuid`; show "saved, will be sent automatically",
- idempotency: the server accepts a `client_uuid` only once and returns the
  existing ticket on repeat,
- `reported_at` is the device capture time; the server also stores `received_at`;
  if the device clock differs by more than 10 minutes, the server uses
  `received_at` for deadlines and flags the ticket,
- spam protection: honeypot, rate limit per IP and per QR token, Altcha only
  when suspicious; suspicious reports are still stored with `suspected_spam`,
- duplicate hint for an open ticket on the same object/system with "create
  anyway" and "add to existing".

Offline architecture:

- Workbox `injectManifest` precaches the app shell, JS, CSS, icons and standard
  text catalog.
- API responses for objects and text templates use stale-while-revalidate with
  an IndexedDB fallback.
- Update strategy: load the new version in the background and show "update
  available – reload"; never force a reload during input.
- Internal users can read assigned tickets, pool, object data and the on-call
  calendar offline.
- Offline writes (acknowledge, comment, decline, confirm/decline shift) go into
  the outbox and are replayed in order.
- The server validates replay; conflicts are returned and shown to the user.
- Claiming from the pool and accepting a swap are online-only.
- iOS/Safari has no Background Sync: sync on app start, `online` event and a
  manual button must work reliably.

## 11. Objects, QR codes and printable stickers

Object list:

- search and filters (active, city, system type),
- detail page with systems, QR display, ticket history and 12-month metrics.

QR rules:

- QR contains only the URL with `qr_token`, never the object number.
- Token: 22 characters, URL-safe, cryptographically random, unique.
- Regeneration: old token redirects for 30 days or is blocked immediately,
  selectable by the admin.

Printable stickers:

- HTML print view for A6 and A4 sheets.
- Contains QR code, object name, object number, "Störung melden: QR-Code scannen"
  and the 112 notice.
- Browser print is the primary path. PDF download is optional and only added
  with a separate WP if needed.

CSV import:

- upload, column mapping and preview (new/changed/unchanged),
- upsert by `object_no`.

BMAcloud object sync:

- Daily read-only pull of the BMAcloud Anlagen (`GET /anlagen`) into the object
  table; one Anlage becomes exactly one object, `object_no = nr` (dots allowed).
- BMAcloud wins for name and address on objects it owns (`external_id` set);
  locally maintained objects are never overwritten, disappeared Anlagen are
  soft-deactivated.
- Configurable cron (`BMA_SYNC_CRON`, default `15 3 * * *`) plus a manual
  "Jetzt abgleichen" trigger; run history in `bma_sync_runs`.
- Bearer key resolvable per run: the `settings` row `bma.api.key` (set on the admin
  page) first, `BMA_API_BASE_URL` / `BMA_API_KEY` in `.env` as fallback; the key is
  write-only — never answered, never logged (ADR-0005). The client allows `GET`
  only. Contract in `specs/17-bmacloud-sync.md`, decisions ADR-0003 and ADR-0005.

REST API `/api/v1`:

- Bearer API key with scopes `objects:read`, `objects:write`, `tickets:read`,
  `tickets:write`,
- `GET /objects?updated_since=`, `PUT /objects/{object_no}`,
  `POST /objects/bulk`, `DELETE /objects/{object_no}`,
- `GET /tickets`, `POST /tickets`, `PATCH /tickets/{ticket_no}/work-order`,
- `POST /webhooks` for `ticket.created` and `ticket.status_changed`,
- OpenAPI generated from Zod schemas, served under `/api/docs`,
- webhooks signed with HMAC-SHA256, retries with backoff.

## 12. Notifications

All notifications go through the `outbox` table in the same transaction as the
ticket event, then through a worker. A channel failure never loses the event.

Channel adapters implement:

```ts
interface Notifier {
  send(target: NotificationTarget, message: NotificationMessage): Promise<Result>
}
```

Phase 1 channels, all external integrations:

- **Web Push (VAPID):** for installed PWAs; iOS 16.4+ only in Safari after
  "add to home screen".
- **ntfy:** external server, topic per user or group, `urgent` for critical
  tickets.
- **Telegram:** external bot, account linking via one-time code.
- **E-mail (SMTP):** external mail server, fallback and escalation.
- **Matrix:** external homeserver.
- **Signal:** external signal-cli bridge.

Rules:

- users choose channels per event type; admin defines mandatory minimum channels
  for `critical`,
- 3 retries with backoff, then the next channel in the escalation chain,
- `notification_sent` and `notification_failed` events in the ticket history,
- message content: ticket number, priority, object name/location, system type,
  short text, AA/SA number if present, deep link; no photos,
- dashboard tile with channel status and last successful delivery,
- admin warning on channel failure.

No notification server is part of the Compose stack.

## 13. Dashboard and statistics

Dashboard:

- "no malfunction since …" counter from the latest non-test, non-cancelled
  ticket; record for the longest fault-free period,
- tiles: open tickets by status, overdue, without review, pool size, current
  on-call, channel status,
- "burning now" list sorted by remaining time with mini timelines,
- `/tv` token-protected wall display with metrics and optionally anonymized
  object names,
- live updates via Server-Sent Events.

Statistics:

- filters: week, month, quarter, year, custom range; object, system type,
  priority, technician,
- reaction times: report → review, report → first response, report → acknowledge;
  median, average, p90, count; pauses reported separately,
- frequency: tickets per day/week/month, by system type, by standard text, by
  source,
- top objects by ticket count, drilldown, "conspicuous" flag above a configurable
  90-day threshold (default 3),
- deadline compliance, decline rate and top decline reasons,
- SQL views or materialized views, never load all tickets into the client,
- CSV export.

## 14. User interface

Public:

- report form `/m/:token`,
- status page `/s/:token`.

Internal:

- dashboard,
- ticket list with filters, search and saved views ("mine", "pool", "overdue"),
- ticket detail with history, photos, timeline and role/status actions,
- on-call calendar,
- object list,
- statistics,
- settings (users, groups, standard texts, deadlines, on-call grid, channels,
  API keys).

Requirements:

- mobile-first, one-hand usable report form,
- desktop two-column layout (list left, detail right),
- fixed action bar at the bottom on mobile ticket detail,
- photo gallery with fullscreen and download,
- accessibility: AA contrast, touch targets at least 44 px, status not conveyed
  by color alone,
- dark mode via `prefers-color-scheme`,
- all text through i18n.

## 15. Non-functional requirements

Security:

- TLS enforced by the external proxy, HSTS, CSP, CSRF protection for cookie auth,
- Argon2id password hashing, rate limits on login and public endpoints,
- server-side file type check by magic bytes, max 10 MB per compressed photo,
- upload directory never served directly; access through authenticated endpoints
  or short-lived signed URLs,
- QR and status tokens at least 128 bits of randomness.

Privacy:

- data minimization for anonymous reporters,
- privacy notice on the form,
- configurable retention: reporter contact data anonymized 24 months after
  closing, photos deleted after 24 months,
- export and deletion of personal data by an admin,
- no plaintext contact data in logs,
- processing record template in `docs/`,
- data hosting in Germany/EU.

Availability and operations:

- daily `pg_dump` and a backup of the uploads volume,
- documented restore procedure,
- health endpoints: API `/api/v1/health`, web `/healthz`,
- structured logs.

Performance:

- report form interactive under 2 s on a mid-range phone over 4G,
- ticket list paginated and usable with 50,000 tickets.

Maintainability:

- versioned migrations,
- complete `.env.example`,
- ESLint and Prettier,
- `npm run check` (typecheck, lint, tests, i18n) green after every WP,
- `docs/REPO-MAP.md` updated after every WP.

Time:

- all server times UTC,
- display and on-call calculations in `Europe/Berlin`,
- DST tests for March and October.

Audit:

- `ticket_events` and `oncall_events` are append-only; a database trigger blocks
  UPDATE and DELETE.

## 16. Phase roadmap

The raw milestone numbers are replaced by phases so that "M6" no longer needs
explanation. Offline is a core feature and appears early.

| Phase  | Content                                                                                                     | Exit criteria                                                                                   |
| ------ | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **0**  | Startability and plan integrity: `.env`, Compose, migrate, volumes, Docker CI, `PLAN.md`, `AGENTS.md`       | `docker compose config`, build, `up -d`, `/healthz` and `/api/v1/health` work; plan is anchored |
| **1**  | Foundation: monorepo, DB, i18n, RBAC, auth, admin UI, CI                                                    | login as admin works, `npm run check` and `npm run build` green                                 |
| **2**  | Report online: objects, QR, printable stickers, report form, status page, spam, duplicates                  | QR report creates a ticket and shows the status page                                            |
| **3**  | Offline report and sync: PWA shell, Dexie outbox, `client_uuid`, idempotency, online sync                   | offline report creates exactly one ticket after reconnect                                       |
| **4**  | Ticket workflow online: state machine, review, AA/SA, assign/offer/claim, accept/decline, acknowledge/close | complete E2E workflow with audit trail                                                          |
| **5**  | Offline internal actions: acknowledge/comment/decline offline, sync, conflicts                              | offline acknowledge syncs and conflicts are shown                                               |
| **6**  | Timeline and escalation: pauses, 72-h bar, pg-boss timers, rules                                            | overdue ticket escalates and appears in the history                                             |
| **7**  | Notifications: outbox, worker, Web Push, ntfy, Matrix, Signal, SMTP, Telegram                               | channel failure retries and falls back; history shows it                                        |
| **8**  | On-call calendar: pools, slots, planning, confirm/decline, swaps, ticket coupling, iCal                     | DST tests and atomic swap tests pass                                                            |
| **9**  | Dashboard and statistics: counter, SSE, tiles, TV, queries, charts, CSV                                     | counter resets on new ticket; statistics match reference data                                   |
| **10** | API and hardening: API keys, object/ticket API, webhooks, OpenAPI, CSV import, privacy, backup/restore      | API contract tests and restore drill pass                                                       |

Each phase is split into small WPs before implementation. A phase is done only
when its exit criteria and its acceptance tests pass.

### Current state and open backlog

Phase 0 is complete (WP-M0-01 … WP-M0-05). Phase 1 is implemented through
**WP-M1-10e** and, in the phase 1 backlog order, **WP-M1-09b**, **WP-M1-09c**,
**WP-M1-09d**, **WP-M1-09e**, **WP-M1-10f**, **WP-M1-10h**, **WP-M1-10i**, **WP-M1-10d**
and **WP-M1-11** (WP-M1-10g was superseded by WP-M1-10h); the phase 1 **record** is closed
as well: **WP-M1-23** … **WP-M1-27** are retroactive work-package documents for the seven
phase 1 commits that landed without one (`3e1c0f8`, `71fd066`, `f0e0fcc`, `1d56aad`,
`d994911`, `4da1c7b`/`ad0b45b` and `7e64dd1`), every `m1` work-package document now
carries a `status:` line, and `.env.example` gained the `LOGIN_RATE_LIMIT_MAX` /
`LOGIN_RATE_LIMIT_WINDOW` pair that `ad0b45b` had left out (§15: complete `.env.example`);
the table below is the
backlog of record (mirrored and kept current in
`work-packages/README.md`, enforced by the `AGENTS.md` rule _Open follow-ups
(mandatory closure)_ — open items of a phase are finished in numeric order before the
next phase starts).

This section is the status history of the project. The inventory of what the
repository actually contains — every module, its purpose and its public API — lives
in `docs/REPO-MAP.md` and is the only place that is kept current after every work
package; do not duplicate it here or in `AGENTS.md`.

| WP        | Content                                      | Status |
| --------- | -------------------------------------------- | ------ |
| WP-M1-09e | login form, logout and route guard (web)     | done   |
| WP-M1-10i | publish run label carries the commit subject | done   |
| WP-M1-10d | English ADRs and `docs/DECISIONS.md`         | done   |
| WP-M1-11  | `docs/REPO-MAP.md` English and current       | done   |
| WP-M1-12  | Playwright smoke test "login as admin works" | done   |
| WP-M1-13  | UI layout shell with header and navigation   | done   |
| WP-M1-14  | base seed keeps an existing admin untouched  | done   |
| WP-M2-00  | core object tables and demo seed             | done   |
| WP-M2-01  | object list CRUD API                         | done   |
| WP-M2-02  | QR generation, regeneration, resolution      | done   |
| WP-M2-02b | QR demo tokens and scheduled cleanup         | done   |
| WP-M2-03  | printable QR sticker sheets (web print)      | done   |
| WP-M2-04  | ticket tables, events, photos, counter       | done   |
| WP-M2-04b | public report endpoint with idempotency      | done   |
| WP-M2-04c | report photo upload (magic bytes, volume)    | done   |
| WP-M1-15  | app version visible in the web shell         | done   |
| WP-M1-16  | current git version in the deployment env    | done   |
| WP-M1-17  | responsive shell with a settings gear        | done   |
| WP-M2-05  | public report form at `/m/:token` (web)      | done   |
| WP-M2-05b | photo upload with client compression         | done   |
| WP-M2-05c | report form smoke E2E in de and en           | done   |
| WP-M2-06  | public status API by `status_token`          | done   |
| WP-M2-06b | public status page at `/s/:token` (web)      | done   |
| WP-M2-07  | report throttle table and suspicion          | done   |
| WP-M2-07b | Altcha captcha API primitives                | done   |
| WP-M2-07c | spam decision on the report create path      | done   |
| WP-M2-07d | honeypot field and Altcha widget (web)       | done   |
| WP-M2-08  | duplicate hint: open tickets and public comment | done   |
| WP-M1-18  | publish chain without cancelled runs         | done   |
| WP-M1-19  | one tag per push for every commit            | done   |
| WP-M1-20  | the push command in the governance documents | done   |
| WP-M1-21  | serialised promotion of `latest`             | done   |
| WP-M1-22  | the app version reads version tags only      | done   |
| WP-M1-23  | record: login card and version display       | done   |
| WP-M1-24  | record: RBAC/admin bootstrap on API start    | done   |
| WP-M1-25  | record: CI database tests, publish queue     | done   |
| WP-M1-26  | record: configurable login rate limit        | done    |
| WP-M1-27  | record: the end-of-session commit rule       | done    |
| WP-M2-26  | back links in the admin pages                | done    |
| WP-M2-32  | record: the BMAcloud contract commit         | done    |
| WP-M2-33  | BMAcloud read-only client and env            | done    |
| WP-M2-34  | `bma_sync_runs` table (migration `0007`)     | done    |
| WP-M2-35  | BMAcloud sync service                        | done    |
| WP-M2-36  | BMAcloud admin API and pg-boss job           | done    |
| WP-M2-36b | `GET` of the BMAcloud schedule pair          | done    |
| WP-M2-37  | BMAcloud sync page (web)                     | done    |
| WP-M2-38  | sync card on the administration home         | done    |
| WP-M2-39  | external badge in the object list            | done    |
| WP-M2-40  | fault template archive schema and contracts  | done    |
| WP-M2-40b | fault template admin and public catalog API  | done    |
| WP-M2-40c | fault template administration UI             | done    |
| WP-M2-40d | fault template entry on the admin home       | done    |
| WP-M2-40e | report form uses the live fault catalog      | done    |
| WP-M2-40f | internal create and detail live catalog      | done    |
| WP-M2-41  | bootstrap standard fault types               | done    |
| WP-M2-41b | E2E fault-chip labels of the bootstrap list  | done    |
| WP-M2-42  | bootstrap of the standard fault types      | done    |
| WP-M2-43  | self-update decision (ADR-0004) and spec 18 | done    |
| WP-M2-44  | admin update page: clean PWA update (stage 1) | done    |
| WP-M2-45  | BMAcloud bearer key in `settings` + admin routes (ADR-0005) | done    |
| WP-M2-46  | the scheduled pull reads the effective bearer key | done    |
| WP-M2-47  | API-key field on the BMAcloud sync page | done    |
| WP-M2-48  | host update agent decision (ADR-0006) and work plan | done    |
| WP-M2-49  | shared contracts: `system.update` and the update schemas | done    |
| WP-M2-50  | the `update_runs` table and migration `0009` | planned |
| WP-M2-51  | the update agent service core (`apps/agent`) | planned |
| WP-M2-52  | the update agent HTTP server | planned |
| WP-M2-53  | the agent image, compose service and env wiring | planned |
| WP-M2-54  | the admin update API | planned |
| WP-M2-55  | the host update section in the admin update page | planned |
| WP-M2-56  | documentation of the host update | planned |

WP-M1-09e closed the login-UI gap: `LoginForm`, `LogoutButton` and the `RequireSession`
guard live in `apps/web/src/auth`, so the exit criterion "login as admin works" is
reachable by hand and can be asserted by WP-M1-12. WP-M1-10i made the publish run
self-describing: the green `check` run of a version tag ends with the job
`Dispatch publish run`, which starts `build.yml` through `workflow_dispatch` with the
version and the commit subject as inputs, so that run is titled
`publish v0.0.NN · <commit subject>` — a run label is fixed when the run starts and no
payload other than a dispatch carries free text. WP-M1-10d closed the English rule for the
decisions: `docs/DECISIONS.md` with its template and both ADRs are English. WP-M1-11 closed
it for the map: `docs/REPO-MAP.md` is English throughout, its tree shows the phase 1
folders plus the planned ones, and its module table names every phase 1 module with purpose
and public API — no language deviation is left in `docs/`. WP-M1-13 gave the app a layout
shell (`apps/web/src/components/Shell.tsx`) with a sticky header, a left navigation and a
centred main area; it reuses the existing `common` i18n keys. WP-M1-14 repaired the base
seed, which commit 82a9fc7 had broken: the insert uses `onConflictDoNothing` again and the
status is decided before the insert, so an existing administrator keeps its `password_hash`,
`locale` and `active` — that fix turned the red `check` runs v0.0.58 … v0.0.61 green.
WP-M1-15 repairs a regression of WP-M1-13: the shell rewrite dropped the version line of
commit 3e1c0f8. The sticky header now renders `AppVersion` outside the signed-in branch,
so the version is visible on the login screen and on every guarded page. The value is
the version of this application, produced by the development workflow: the pre-commit
hook writes the next version into the tracked `VERSION` file, the post-commit hook tags
exactly that value, and image builds read the file because they have no git metadata.
It is never the frontend stack and never a manually maintained `.env` value.
WP-M1-17 makes the shell phone-first: the permanent sidebar is gone, a 44 × 44 px gear next
to the version opens the account, the user/role/sticker pages and logout in a dropdown, and
the admin tables scroll horizontally on narrow screens.
Phase 2 has started: `specs/02-data-model.md` was filled from §6 and reviewed, and it
settles the `object_no` question of WP-M2-00 (§4.3.1 — user input, required, unique over
`lower(object_no)`, `_` allowed, e.g. `12345_01`; no pool table, the object list is the
maintained table, tickets link by UUID foreign key). WP-M2-00 put the four core object
tables behind migration `0002_core_object_tables`, added the localized `STANDARD_TEXTS` in
`packages/shared/src/seed/` and the idempotent `seed-demo.ts` (three example objects with
one `BMA` each, nine templates in `de` and `en`, a second run is a no-op). WP-M2-01 added
the object list CRUD API (`/api/v1/objects` with search/filter, system sync and soft
delete) on top of those tables; `specs/08-objects-api.md` §9.1 now carries that contract.
WP-M2-02 filled §9.2 and §4.7 for QR tokens and implemented the QR layer: create now
generates a 22-character `base64url` token, migration `0003_old_qr_tokens` stores retired
tokens, `POST /api/v1/objects/:objectNo/regenerate-qr` rotates and retires them (30 days,
or immediately with `blockOldToken`), and public `GET /api/v1/public/qr/:token` resolves
current/retired active tokens for `/m/:token`. Its split child **WP-M2-02b** is done too:
`seed-demo.ts` generates a token for every inserted demo object and backfills a `NULL`
token (an existing token is never touched), and `apps/api/src/jobs/qr-cleanup.ts` adds
`deleteExpiredQrTokens` plus the pg-boss queue `qr-token-cleanup` on the cron `0 3 * * *`
with one short-lived pool per job — started only from the direct API start and stopped by
an `onClose` hook, so `buildServer` and the test suite never create the pg-boss schema.
**WP-M2-03** replaces the legacy PDF plan with the print path of §4/§11: `StickerPage`
under the guarded route `/objects/stickers` shows the active objects as a checklist and
prints A6 or A4 sheets through `window.print()` — every card carries the `qrcode.react`
QR of `<origin>/m/<token>`, the object name, the object number, the report call and the
112 notice — and the selected format writes the matching `@page` rule in
`apps/web/src/styles.css`; `specs/08-objects-api.md` §9.3 carries that contract.
**WP-M2-04** put the ticket schema behind migration `0004_ticket_tables`: `tickets`
(object FK `ON DELETE RESTRICT`, unique `ticket_no`/`client_uuid`/`status_token`, the
status/priority/source checks of §7/§13, `reported_at`/`received_at`/`deadline_at`,
`clock_skewed`, `suspected_spam`, `parent_ticket_id`), the append-only `ticket_events`
trail, the `ticket_photos` metadata and `ticket_no_counters` behind the `next_ticket_no()`
column default (`ST-<year>-NNNN`). Its split child **WP-M2-04b** is implemented:
`POST /api/v1/public/tickets` (`apps/api/src/tickets/report.ts` plus the schemas in
`packages/shared/src/schemas/ticket.ts`) resolves the QR token to an **active** object,
enforces the text/contact/system rules with the codes `report_text_required`,
`contact_required` and `system_not_found`, applies the ±10 minute clock rule and the
72 h deadline, and answers an idempotent `client_uuid` repeat with `200` and the
existing ticket. Its split child **WP-M2-04c** is implemented too: the report body
carries up to six base64 photo data URLs (`photoDataUrlSchema`), each decoded photo is
capped at `UPLOAD_MAX_BYTES` and verified by magic bytes before anything is written, and
the files live at `<UPLOAD_DIR>/tickets/<ticketId>/<file_uuid>.<ext>` with the relative
path, MIME type and byte count in `ticket_photos` —
`422 photo_limit_exceeded`/`photo_too_large`/`photo_type_unsupported`. Reading a photo is
phase 10 (the volume is never served), the per-IP and per-token throttle table is WP-M2-07 and
its use on the create path is WP-M2-07c.
**WP-M2-05** is rewritten into the small-model format and split before implementation: the
legacy plan mixed the route, six components, the canvas compression, the confirmation page
and two Playwright tests into one package. **WP-M2-05** (`05-report-form-ui.md`) is implemented as the
public form at the unguarded route `/m/:token` (object header, system select, fault chips
over `STANDARD_TEXT_KEYS`, free text, contact fields, 112 notice, confirmation with the
ticket number and the `/s/<statusToken>` link); **WP-M2-05b**
(`05b-report-photo-upload-ui.md`) adds the client compression to 1600 px/JPEG 0.8 and the
six-photo uploader (`image-compress.ts`, `photo-upload.tsx`, data URLs in the JSON body,
the photo error codes and `photoCount` on the confirmation), and **WP-M2-05c**
(`05c-report-form-e2e.md`) proves the flow in a real browser in `de` and `en`.
**WP-M2-06** is rewritten into the small-model format and split before implementation: the
legacy plan mixed the public status API, the page and its tests into one package.
**WP-M2-06** (`06-status-page.md`) is implemented as the status API —
`GET /api/v1/public/tickets/:token/status` with the ticket number, the current status, the
deadline and only the whitelisted event types as `{ type, at }` — and its child
**WP-M2-06b** (`06b-status-page-ui.md`) is implemented as the public page at `/s/:token` with
the status badge and the timeline in `de` and `en`.
**WP-M2-07** is rewritten into the small-model format and split before implementation: the
legacy package bundled the throttle, the honeypot, the Altcha server, the create-path
decision and the form into one run. **WP-M2-07** (`07-spam-protection.md`) is implemented as the
report throttle — migration `0005_report_throttle` plus `recordReportAttempt`,
`recentReportCount` and `isReportSuspicious` in `apps/api/src/tickets/spam.ts` (> 3 reports per
10 minutes per IP **or** QR token), detection only, no route reads it yet; **WP-M2-07b**
(`07b-altcha-captcha-api.md`) is implemented as the `altcha-lib` primitives
(`POST /api/v1/public/altcha/challenge`, `verifyAltchaPayload`, `altchaVerificationSchema`);
**WP-M2-07c** (`07c-spam-decision-report-path.md`) is implemented as the create-path spam
decision: it puts the honeypot, the throttle and Altcha on the report endpoint, stores a
suspicious or honeypot report with `tickets.suspected_spam` and answers
`400 captcha_required` for a suspicious report without a valid proof of work; **WP-M2-07d**
(`07d-spam-form-ui.md`) is implemented as the web form's hidden `website` honeypot and the
Altcha widget that appears only after a `400 captcha_required` — the challenge is fetched
from `POST /api/v1/public/altcha/challenge`, the solved proof of work travels back in the
`verification` field of the next attempt, and the widget is loaded on demand, so a reporter
of a normal report never sees a captcha. **WP-M2-08** (`08-duplicate-hint.md`) is
implemented as the duplicate hint of `specs/06-report-form.md` §7.8 in **one** package
without a split: `GET /api/v1/public/tickets/open` lists the open tickets of the object
of the current QR token (closed, cancelled and suspected spam tickets stay hidden), and
`POST /api/v1/public/tickets/:ticketNo/comments` appends the text of the reporter to an
open ticket of that object as one append-only `comment` event — the **QR token of the
object is the capability**, so no `status_token` of a foreign ticket is handed out. The
public form shows the hint with one "Ergänzen" button per open ticket and one "Trotzdem
neu melden" button, and every new report of an object with an open ticket carries the
`parentTicketId` of the oldest open ticket in `tickets.parent_ticket_id` (§6).

Phase 2 is **complete**. **WP-M2-00 … WP-M2-31** are implemented, **WP-M2-26** closed the last
backlog item of that run and **WP-M2-32** closed its record gap: commit `a6804ed` had landed
the BMAcloud contract (`specs/17-bmacloud-sync.md`, ADR-0003 and the §11 block above) without
a work package, without a WP id in its subject and with **no implementation** — no client, no
`bma_sync_runs` table, no `BMA_*` environment key, no admin route and no page. That gap is
worked off: **WP-M2-33** (read-only client and environment), **WP-M2-34** (the
`bma_sync_runs` run log), **WP-M2-35** (mapping and sync service), **WP-M2-36** (admin API and
pg-boss job), **WP-M2-36b** (the `GET` of the effective schedule pair, which closed the open
question of WP-M2-36), **WP-M2-37** (the admin page at `/admin/bma-sync`), **WP-M2-38** (its
card on the administration home) and **WP-M2-39** (the "extern gepflegt" badge in the object
list) are implemented, and so are the fault-template packages **WP-M2-40 … WP-M2-42** plus
the self-update governance **WP-M2-43** and its stage-1 client update page **WP-M2-44**. No
phase 2 work package is open; what phase 2 leaves behind are three documented **questions**,
not features: the retention of `report_throttle.ip` (WP-M2-07, WP-M2-07c), the retention of
`bma_sync_runs.conflicts` (WP-M2-32) and the missing `meta/0006_snapshot.json` of the
hand-written migration 0006 (WP-M2-34). The phase 2 `status:` lines of `09` … `31` match the
shipped code.

After the phase 2 close a usage gap of the BMAcloud sync surfaced in the field: the sync page
offers everything but the credential, so an image-based deployment could only answer
`bma_not_configured`. **ADR-0005** supersedes the credential rule of ADR-0003 — the key may
live in the `settings` row `bma.api.key`, which wins over `BMA_API_KEY` and is write-only
(never answered, never logged). **WP-M2-45** implements the shared contract, `readBmaApiKey`
and the three credential routes and **WP-M2-46** the effective key of the scheduled job — the
startup read decides whether the queue is scheduled at all and every run resolves the key
again, so a stored or deleted key needs no API restart. **WP-M2-47** added the write-only
key field on `/admin/bma-sync`.

Stage 2 of the self-update (the real host update: `git pull` → `docker compose up -d --build`
→ `docker image prune -f`) is planned as the chain **WP-M2-48 … WP-M2-56**. **WP-M2-48** fixes
the topology with **ADR-0006**: the update agent is a service of the **same** compose project
behind the profile `update` — a plain `docker compose up -d --build` skips it, so the agent
survives the redeploy it triggers — mounted with the checkout and the Docker socket and
reachable only on the internal network with the bearer `UPDATE_AGENT_TOKEN`. The chain then
implements the shared contracts (`system.update`), the `update_runs` table, the agent service,
its image and compose wiring, the admin API, the page section and the documentation — in that
order, one commit per work package.

## 17. Work package rules for small models

Target: a 64k–128k context model such as Qwen can finish one WP without losing
the thread.

Hard limits:

- one WP = one commit = one model run,
- max. 3–4 changed source files (tests and fixtures excluded),
- max. about 300 changed lines,
- max. 6 source files read,
- WP document max. 120 lines,
- spec excerpt max. 200 lines,
- context target 12–20k tokens, hard limit 30k for 64k models; 25–40k target and
  60k hard limit for 128k models,
- if a WP exceeds a limit, split it before writing code.

Every WP contains:

- `depends-on`
- `milestone` / phase
- `context-budget`
- `spec` reference with section
- `files-read`
- `files-write`
- `interfaces`
- `task`
- `non-goals`
- `acceptance` with exact commands
- `handoff`

Template: `docs/WP-TEMPLATE.md`. Validation: `scripts/wp-check.mjs` (added in
Phase 0).

Layer order:

1. database schema and migration,
2. service/domain function,
3. API route and Zod schema,
4. UI and i18n,
5. tests and docs.

Do not mix unrelated layers in one WP. A vertical slice is allowed only when it
stays within the file and line limits.

## 18. Quality gates

After every WP:

```bash
npm run check
npm run build
```

### 18.1 The `check` gate

`npm run check` runs these gates in order:

1. `npm run typecheck --workspaces --if-present` — TypeScript per workspace.
   **Deviation from WP-M1-01:** the root script uses the per-workspace typechecks
   instead of one `tsc --noEmit` across all packages, because the API (Node) and
   the web (DOM) need different `lib` sets; the root `tsconfig.json` remains for
   editor and IDE support.
2. `eslint .` — flat config `eslint.config.js`, including
   `i18next/no-literal-string`.
3. `vitest run` — one Vitest project per workspace.
4. `npm run i18n:check` — de/en key parity and referenced keys (§3.1).
5. `npm run wp:check` — work-package size, context budget and required fields.
6. `npm run test:e2e` — Playwright smoke test on a throwaway database
   (`WP-M1-12`); without a reachable database or a startable browser it prints one
   notice and stays green locally, but in CI (`CI=true`) a missing prerequisite is
   an error.

Phase 0 and every Docker-related WP additionally:

```bash
docker compose config
docker compose build
docker compose up -d
curl -fsS http://localhost:3080/healthz
curl -fsS http://localhost:3080/api/v1/health
docker compose down
```

The stack publishes only the web port (`WEB_PORT`). A work package must not
publish an API or database host port; direct API access for curl or monitoring
goes through the optional override `docker-compose.debug.yml`.

### 18.2 Database, migrations and seeds in development

- Local PostgreSQL 16: `docker compose -f docker-compose.dev.yml up -d db`
  (credentials as in `.env.example`).
- Migrations: `npm run db:migrate -w @stoerdesk/api`; change the schema with
  `npm run db:generate -w @stoerdesk/api` (drizzle-kit, output folder
  `apps/api/src/db/migrations`).
- Seeds are idempotent and ordered: `npx tsx src/db/seed-rbac.ts`, then
  `src/db/seed-base.ts` (bootstrap administrator from `SEED_ADMIN_EMAIL` /
  `SEED_ADMIN_PASSWORD`), then `src/db/seed-demo.ts`. Seed output never contains an
  e-mail or a password.
- API integration tests run against a real database through `TEST_DATABASE_URL`
  (fallback `DATABASE_URL`); CI provides PostgreSQL 16. Without a reachable
  database they are skipped and `npm run check` stays green — the skip verifies
  nothing, it is reported as unverified.
- The E2E (`npm run test:e2e`, `scripts/e2e-check.mjs`) uses the same connection to
  create its own throwaway database `stoerdesk_e2e_<run>`, migrates and seeds it,
  runs Playwright and drops it again — it never writes into a shared database, and
  it skips when the account may not `CREATE DATABASE`. The bundled Playwright
  Chromium is a glibc build: in a musl (Alpine) container point
  `E2E_CHROMIUM_PATH` at a distribution browser, e.g.
  `E2E_CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e`.
- `scripts/docker-smoke.sh` (CI job `docker-smoke`) is the only Docker-level test;
  it runs in CI, never in an environment without a Docker daemon.

### 18.3 CI pipeline, run names and version tags

- The quality gates hang on the **version tag**: `check.yml` triggers on
  `push: tags: ['v[0-9]*']` plus `pull_request` and sets
  `run-name: ${{ github.ref_name }}`, so the run title is `v0.0.NN`. A commit
  pushed **without** its tag starts no quality-gate run and publishes nothing.
- **A run label cannot be renamed afterwards.** GitHub offers no endpoint for it, so
  the text must be in the event payload when the run starts. A tag-push payload
  carries the version but no usable single line (`head_commit.message` is the whole
  multiline message, and Actions expressions have no `substring()`). Therefore the
  publish run is **dispatched**: the `Dispatch publish run` job of a green tag
  `check` run calls
  `POST /repos/<repo>/actions/workflows/build.yml/dispatches` with the inputs
  `version`, `notes` (the commit subject), `source_run` and `mode=check`, because a
  `workflow_dispatch` payload is the only one that carries free text. `build.yml`
  titles itself `publish v0.0.NN · <commit subject>`; a manual run titles itself
  `publish <version> · manual · <ref>`. The publish job names
  (`Publish <service> image <version>`) and their job summaries (what is new,
  publisher, image names, tags, version, source SHA, source run URL) are the second
  carrier of that information.
- A publish run writes the version tags of its commit (`v0.0.NN`, `0.0.NN`,
  `sha-<sha>`) and then **promotes `latest`** to the newest version that exists in
  the registry: the promotion reads the tags, takes the highest one and points
  `latest` at that manifest (`docker buildx imagetools create`). `latest` therefore
  never depends on which build finished last, and a failed build leaves it on the
  newest version that was really published. The promotions of one image are serialised
  (concurrency group `latest-<image>`), so the read of the registry and the write of
  `latest` never interleave with another promotion and `latest` can only move forward.
- Publish runs do **not** share one concurrency group. GitHub keeps only one
  pending run per group and cancels the previous pending one when a new run is
  queued, so a shared group made a queued publish run disappear without publishing
  its version. Each run gets the group `publish-<version>`, so no run can cancel
  another.
- **One annotated tag per commit** (`v0.0.1`, `v0.0.2`, …). `.husky/post-commit`
  reads the highest existing version tag, bumps the patch number and creates the
  annotated tag on the new commit; `.husky/post-merge` does the same for merge
  commits; rebases and already-tagged HEADs are skipped, no double tags. The hook
  prints `commit <short-hash> successful - version v0.0.N` and the hint to run
  `npm run release:push`. The tag is the version of record; the `version`
  fields in the `package.json` files stay on the current release line. Annotated
  tags are required so the push publishes them; tags are never
  pushed automatically.
- **One tag per push.** GitHub creates no tag push event when more than three tags
  are pushed at once ("Events will not be created for tags when more than three tags
  are pushed at once"), and the quality gates hang on that event: a batch push would
  leave the older commits without a check run and without published images.
  `npm run release:push` therefore pushes the branch first and every missing version
  tag in its own push, so every commit gets its own run.
- The version in the web shell is the application version produced by the
  development workflow. `.husky/pre-commit` writes the next version into the
  tracked `VERSION` file and stages it; `.husky/post-commit` tags exactly that
  value. Docker builds read `VERSION` from the context, so no git metadata and no
  `.env` entry is required (WP-M1-16).
- **GitHub push credentials:** the fine-grained PAT lives in the git credential
  store — file `~/.git-credentials` (helper `store`, host `github.com`, user
  `icem0`), set up once per environment. The token itself never appears in the
  repository, docs, logs or commits.

Definition of done:

- code, tests, lint, typecheck and docs agree,
- `docs/REPO-MAP.md` updated,
- no secrets or PII in the diff,
- WP acceptance commands executed and reported,
- commit follows Conventional Commits with DCO sign-off.

## 19. Open decisions

These decisions need an ADR or explicit approval before the related WP starts:

- mandatory messenger set for production (default: ntfy, Matrix, Signal, Web
  Push, SMTP, Telegram available; admin decides which are mandatory),
- hosting model (homelab behind Cloudflare vs. external server) — **resolved for
  the running instance**: a host checkout deployed with `docker compose up -d
  --build` (ADR-0004, `docs/DEPLOYMENT.md`). The admin self-update is an
  out-of-band host update agent, never shell execution in the `api` container and
  never an OS password (ADR-0004, `specs/18-self-update.md`).
- multi-tenancy (default: no),
- default deadlines per priority and contract type,
- whether shift swaps require admin approval by default (default: yes),
- name and logo (working title: StörDesk).

Technical defaults already chosen in this plan:

- `@node-rs/argon2` for password hashing,
- `date-fns-tz` for time zones and DST,
- printable HTML QR stickers; optional `pdf-lib` later,
- Fastify OpenAPI stack,
- external notification services only.

## 20. Acceptance summary

The full, testable acceptance criteria will live in `specs/16-acceptance.md`
once that slice is filled; until then this section is authoritative. The
minimum end-to-end acceptance for the first complete release:

1. Scan a QR code, submit a report with two photos, see the ticket in the office
   list within 3 s, receive an office notification.
2. Enable flight mode, submit a report, disable flight mode: exactly one ticket
   is created, `reported_at` is the capture time.
3. Two technicians claim the same offer: exactly one wins, the other sees
   "already claimed".
4. Decline without a reason is impossible (UI and API return 422).
5. Acknowledge without a note is impossible; with note and photo the timeline
   stops.
6. An unclaimed ticket escalates after the configured deadline and the event is
   in the history.
7. Object API upsert, update and deactivate works; invalid payload returns 422
   with field errors.
8. The "no malfunction since" counter resets on a new report and ignores test
   tickets.
9. Statistics median matches the reference value from seeded test data.
10. A failed notification channel retries, then falls back; the failure is
    visible in the history and on the dashboard.
11. iPhone test: install to home screen, grant push, receive push while the app
    is closed.
12. On-call calendar: DST slot calculation, decline without reason, atomic swap,
    on-call-first offer, unstaffed warning.
