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
**WP-M1-09d**, **WP-M1-10f** and
**WP-M1-10g**; the table below is the
backlog of record (mirrored and kept current in
`work-packages/README.md`, enforced by the `AGENTS.md` rule _Open follow-ups
(mandatory closure)_ — open items of a phase are finished in numeric order before the
next phase starts).

| WP        | Content                                      | Status |
| --------- | -------------------------------------------- | ------ |
| WP-M1-09e | login form, logout and route guard (web)     | open   |
| WP-M1-10d | English ADRs and `docs/DECISIONS.md`         | open   |
| WP-M1-11  | `docs/REPO-MAP.md` normalized to English     | open   |
| WP-M1-12  | Playwright smoke test "login as admin works" | open   |

Phase 1 cannot exit before WP-M1-09e exists: the exit criterion "login as admin
works" needs a login form, and `apps/web` renders a placeholder only. Phase 2 starts
after the phase 1 backlog is closed.

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

Database integration tests use `TEST_DATABASE_URL`; CI provides PostgreSQL 16.
A WP is not done when tests are skipped because no database is available.

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
- hosting model (homelab behind Cloudflare vs. external server),
- multi-tenancy (default: no),
- default deadlines per priority and contract type,
- source and format of object data for sync (CSV, ERP, work-order system),
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
