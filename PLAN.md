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
- `stats.read`, `stats.export`, `notification.read`, `notification.write`,
  `notification.read_all` (the messages of other users; the key belongs to no
  default role, `specs/01-rbac.md` §3.3)

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
- `object_priority_overrides` — the priority of an object deviates from the
  standard (ADR-0029): the object reference and the deviation; the standard
  itself is the setting `ticket.default_priority`
- `tickets` — readable `ticket_no`, object/system, status, priority, title,
  description, `reported_at`, `received_at`, source, reporter data, work-order
  type/number, assignment data, response timestamps, `client_uuid`, flags,
  `parent_ticket_id`, `deadline_at`
- `ticket_events` — append-only audit log with actor, type, payload
- `ticket_photos` — file path, MIME type, size, dimensions, uploader
- `ticket_pauses` — wait reason, start/end, actor
- `text_templates` and `text_template_translations` — localized standard texts
- `escalation_stages`, `escalation_rules`, `escalation_actions` — the escalation
  configuration (ADR-0017, ADR-0023): the stages as a configurable chain
  (`key`, `predecessor` nullable, `reached_by` jsonb), the rules with their
  deadlines per priority and their conditions, the actions of a rule;
  `escalation_rules.stage_key` cascades onto the stage, so removing a stage
  removes its rules (migration `0037_escalation_stage_chain`)
- `escalation_firings` — the firing log of the escalation: unique over
  `(ticket_id, rule_key, threshold_at)`, so a rule fires once per threshold
- `ticket_statuses` and `ticket_transitions` — the workflow as configuration (ADR-0025,
  WP-M14-35, WP-M14-38a … WP-M14-38c): the status rows (`key`, `names` de/en, `color`,
  `position`, `active`, `is_terminal`) and the steps (`from_status`, `to_status` as foreign
  keys to `ticket_statuses.key` with `ON DELETE cascade`, `event_key` unique per step, the
  nullable `condition_json` stored now and evaluated only from WP-M14-41, `active`);
  migration `0041_ticket_transitions.sql` seeds the 22 steps of §7 and drops
  `tickets_status_check`
- `users`, `groups`, `user_groups`, `sessions`, `api_keys`
  - `users.theme` — `auto` (follows `prefers-color-scheme`), `light` or `dark`
    (WP-M2-92)
  - `users.given_name` / `users.family_name` — sortable klarmname, `''` when unset,
    max. 64 characters, stored trimmed, indexed by `users_name_idx` over
    `lower(family_name), lower(given_name)`; the seed and the migration derive the
    family name from the e-mail local part (WP-M2-93)
- `notification_channels`, `push_subscriptions`, `outbox`
- `settings`
- `oncall_pools`, `oncall_shifts`, `oncall_swap_requests`, `oncall_events`
- `old_qr_tokens` — redirects for regenerated QR codes

Required fields beyond the raw specification:

- `tickets.reviewed_by_user_id`, `tickets.review_started_at`
- `tickets.offered_to_user_id`, `tickets.offer_escalated_at`
- `tickets.status_token` for the public status page
- `tickets.ticket_no` generated by a concurrency-safe counter that carries no
  calendar year (ADR-0027: `ST-0001`, one global counter row, a customer must not
  infer the frequency of the disturbances from the number the customer sees)
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
`SWAP_REQUESTED`; a slot without a technician is `UNFILLED`. The technician can
also accept an assigned `DRAFT` readiness — the acceptance publishes it (ADR-0021).

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
- Readiness notifications (ADR-0021, WP-M14-27 … WP-M14-32): allocating a
  technician enqueues `oncall.assigned`, an open swap enqueues
  `oncall.swap_requested` and the escalation scan enqueues one
  `oncall.unconfirmed_reminder` per shift that still waits for a decision
  within `oncall.reminder_unconfirmed_h`; the technician selects those channels
  in `/settings/notifications` (the rules of §12 apply), the message names the
  pool, the start and end in `Europe/Berlin`, the state and the link to
  `/oncall`.
- The readiness has its own page `/oncall` (WP-M10-33, WP-M10-34): the
  readiness calendar shows every shift of the week, the own readiness (own
  shifts, iCal feed, confirm, decline, swap) is below it and an admin reaches
  the administration of the readiness from there. The dashboard shows no
  readiness any more (WP-M10-32).
- The **technician travels with the shift** (ADR-0032, WP-M14-151): the
  calendar range `GET /api/v1/oncall/shifts` answers `technician` — the display
  data of `user_id` — next to every shift of the range, because the technician
  of a shift need not be a member of its pool (`specs/04-oncall.md` §4a.2 names
  the pool as the candidates of a swap, §4a.3 keeps `user_id` a foreign key to
  `users`). The readiness calendar names the technician of the shift it received
  and asks for the members of a pool no more, so every role that reads the
  calendar sees who has the readiness when; a shift with a technician is never
  called "nicht besetzt".
- The **names** of the technicians in the readiness calendar are a right of
  their own: the permission `oncall.read_names` (WP-M14-131). A role without it
  reads the same calendar — the state and the pool of every shift — but the row
  answers "besetzt" instead of the name (WP-M14-132). The API keeps answering
  the names to `oncall.read` (the members of a pool are the candidates of a
  swap); the gate is in the web app.
- The **shift history** (WP-M14-154, out of band in phase 14): a click on a
  shift of the readiness calendar or on an own shift opens a dialog with the
  state, the pool, the period, the technician and the append-only history of
  the shift. The history names every step with its time and its acting person —
  created, assigned (by whom to whom), published, confirmed, declined (with the
  reason) and every swap step. `GET /api/v1/oncall/shifts/:id/history`
  (`oncall.read`) answers the named fields only, never a raw event payload; the
  name gate of `oncall.read_names` applies as in the calendar (§4a.10).
- The **current day is marked specially** in the readiness calendar (WP-M14-156):
  the cell of the Berlin calendar date of now keeps its state colour and gains
  a ring and a semibold date number; today without a shift stays ringed, so the
  office reads gaps and shifts against the wall clock without counting weeks.

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

Default escalation rules — the stages are the milestones of the workflow
(ADR-0017), a stage is reached when the ticket enters the following workflow
state, and the deadline of a stage is the time the ticket may wait for that
milestone:

| Stage (milestone) | Waiting state | Default (critical) | Rule key |
| ------------------ | ------------- | ------------------- | -------- |
| Prüfung (review) | `NEW` | 15 min (5 min) | `review` |
| Auftrag angelegt (work order created) | `IN_REVIEW` | 30 min | `work_order` |
| Zuweisen oder Anbieten (assign or offer) | `WORK_ORDER_CREATED` | 30 min | `assignment` |
| Angenommen (accepted) | `OFFERED` / `ASSIGNED` | 20 min (10 min) / 15 min | `acceptance_offer`, `acceptance_assignment` |
| Quittiert (acknowledged) | `ACCEPTED` | 60 min | `acknowledgement` |
| 80 % of total deadline | — | — | `deadline_80_percent` |
| total deadline exceeded | — | — | `deadline_exceeded` |

The stages, the deadlines per priority, the conditions and the actions of a rule
are configuration in the administration (`/admin/escalation`); the rules run
24/7, pause with the ticket and fire exactly once per ticket, rule and
threshold. The actions of the first version are non-mutating: `notify` (a subset
of the configured channels), `webhook` (selected endpoints) and `history` (an
append-only note). Since ADR-0026 two more actions distribute a ticket: `offer`
(the ticket is offered to a readiness pool or to a user group) and `assign` (the
technicians of that target are assigned). Both carry the target as
`{ kind, id }`, perform a step of the transition table and are configured like
every other action; the assignment is recorded in `ticket_assignees`. Since
ADR-0033 the target of both actions may also be a single technician of the
installation (`kind: 'user'`), and the target of a `notify` action may be
`assigned` — the assignees of the ticket, that is the technician the escalation
assigned and the technician who took the ticket himself after an offer.

The stage set itself is configuration too (ADR-0023, `specs/07-escalation.md`
§7.11): the administration adds and removes stages and every stage names its
predecessor or none. A stage without predecessor waits from `received_at`, a
stage with predecessor waits from the moment that predecessor was reached — the
latest event of its `reached_by`. The chain is validated as one graph (unique
keys, predecessor exists, no cycle, order consistent with `position`), replacing
the whole set in one transaction; removing a stage removes its rules through the
foreign key `escalation_rules.stage_key`, the firing log keeps the audit. The
seed of the five stages of the table above is the default chain of a new
installation, not a law.

Since ADR-0030 the conditions of a rule may also ask for the readiness service:
the field `shift` names a readiness pool and matches when the pool has a staffed
shift at that moment — a confirmed, a swapped or a planned shift that covers
now. A `notify` action with a readiness pool as its target reaches the
technicians who have a shift in that pool; the members of the pool without a
shift receive nothing.

## 10. Report form and offline

Public route: `/m/<qr_token>`. Status page: `/s/<status_token>`.

Fields:

- object (prefilled from QR, searchable internally),
- system (prefilled for system QR codes),
- fault type from localized standard templates (multi-select) and/or free text,
  at least one required,
- up to 6 photos, compressed client-side to max. 1600 px and JPEG quality 0.8,
- contact name plus phone or e-mail (at least one),
- priority: the internal user chooses it; a QR report takes the deviation of the
  object, else the standard (ADR-0029).

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
interface NotificationChannel {
  readonly name: string
  send(message: NotificationMessage): Promise<void>
}
```

The target of a message travels in the row of the outbox, not in the call of
the adapter, so a retry reaches the same target again.

Channels, all external integrations:

- **Web Push (VAPID):** for installed PWAs; iOS 16.4+ only in Safari after
  "add to home screen".
- **ntfy:** external server, topic per user or group, `urgent` for critical
  tickets.
- **Telegram:** external bot, account linking via one-time code.
- **E-mail (SMTP):** external mail server, fallback and escalation.
- **Matrix:** external homeserver, account linking per user.
- **Signal:** external signal-cli bridge.
- **WhatsApp Web:** external bridge of the operator (ADR-0020) — StörDesk
  ships no browser and no WhatsApp session.

Rules:

- the configuration of a channel lives in `notification_channels`, the
  environment is the fallback; the accounts of the users live in
  `notification_accounts`; both secrets are write-only (ADR-0019),
- the event types are `ticket.created`, `ticket.assigned`, `ticket.escalated`
  and `ticket.resolved` plus the readiness types `oncall.assigned`,
  `oncall.swap_requested` and `oncall.unconfirmed_reminder` (ADR-0021); users
  choose the channels per event type, the admin defines the mandatory minimum
  channels for `critical` and the escalation rule decides the channels of an
  escalation,
- 3 retries with backoff, then the next channel in the escalation chain,
- `notification_sent` and `notification_failed` events in the ticket history,
- message content: ticket number, priority, object name/location, system type,
  short text, AA/SA number if present, the deep link into the ticket (WP-M14-68); a readiness message names pool,
  start and end in `Europe/Berlin`, state and the link to `/oncall` (ADR-0021);
  no photos,
- dashboard tile with channel status and last successful delivery,
- admin warning on channel failure.

The contract of the channels is `specs/10-notifications.md` §11.1–§11.14. No
notification server is part of the Compose stack.

## 13. Dashboard and statistics

Dashboard:

- "no malfunction since …" counter from the latest non-test, non-cancelled
  ticket; record for the longest fault-free period,
- tiles: open tickets by status, overdue, without review, pool size, current
  on-call, channel status,
- "burning now" list sorted by remaining time with mini timelines,
- `/tv` token-protected wall display: it renders the **same display as the start
  page** (statistics first, then the open tickets) with the links switched off —
  a wall monitor is a display only (WP-M10-36); object names stay optionally
  anonymized,
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
- dark mode via `prefers-color-scheme`, plus a theme per user (`auto`, `light`,
  `dark`) that the user management sets (WP-M2-92),
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
| **10** | API and hardening: API keys, object/ticket API, webhooks, OpenAPI, CSV import, privacy, backup/restore | API contract tests and restore drill pass |
| **11** | Detected errors: admin catalog (CRUD, archive), close with comment + detected errors, statistics `byDetectedError` | Close stores detected errors; statistics groups by detected error; admin catalog editable |
| **12** | Acceptance: criteria slice, end-to-end acceptance suite for the items of §20                              | every acceptance item is `PASS` or `UNVERIFIED` by design, never a green skip                 |
| **13** | Escalation logic: the workflow stages, the waiting deadlines per priority, the conditions and the actions | a stage fires its rule once, the actions run, the old stage system is gone |
| **14** | Administration consolidation and messenger channels: the administration home disappears into the settings menu, the channels become configurable (ntfy, Telegram, Matrix, WhatsApp Web), the accounts are linked and the users choose their channels; the workflow and the escalation stages become a configurable chain (WP-M14-35 … WP-M14-44, WP-M14-58 … WP-M14-67) | every channel is configured in the administration, a linked account receives a ticket notification and a failure stays visible; a stage or a status can be added, removed and chained to a predecessor |

Each phase is split into small WPs before implementation. A phase is done only
when its exit criteria and its acceptance tests pass.

### Current state and open backlog

**WP-M14-31 — the reminder of an unconfirmed readiness (done).** `enqueueOncallReminders(database, env, now)`
in `apps/api/src/oncall/coupling.ts` queues one `oncall.unconfirmed_reminder`
outbox row per `DRAFT` or `PLANNED` shift that has a technician, has not started
and starts within `oncall.reminder_unconfirmed_h` — through `enqueueOncallOutbox`
of WP-M14-28, one transaction per shift, skipped while such a row for that shift
is already `PENDING` or `SENT` (one reminder per shift). `apps/api/src/jobs/escalation.ts`
runs the sweep after `evaluateEscalations` (which carries `escalateOnCallOffers`)
inside the existing per-minute `ticket-escalation` job and logs the aggregate
`remindersQueued` counter next to `offerScanned`, never a shift id; no second
queue and no new cron entry (ADR-0021, `specs/10-notifications.md` §11.7). The
integration test `apps/api/src/oncall/__tests__/reminder-notification.integration.spec.ts`
proves the window, the idempotent second scan and the three shifts that stay
silent.

**WP-M14-32 — the readiness selection of the technician (done).** The readiness block
of `/settings/notifications` (`apps/web/src/settings/notifications-page.tsx`) shows the
three readiness event types of §11.4 (ADR-0021) as their own rows below the ticket-event
selection section of WP-M14-17, one checkbox per configured channel of §11.1; a
channel that is not configured is not offered and a user without a saved row for
a readiness event sees "the channels of the instance" (the fallback of §11.4).
Toggling a readiness checkbox feeds the same shared selection state that
`PUT /api/v1/notifications/preferences` of WP-M14-16 writes — no API, schema or
migration change, no readiness entry in the administration of the channels
and no change of the ticket event rows. The settings namespace keys
`settings.notifications.events.oncall.assigned` = "Bereitschaft allocation" / "Readiness
allocation", `oncall.swap_requested` = "Swap request" / "Swap requested" and
`oncall.unconfirmed_reminder` = "Unconfirmed reminder" / "Unconfirmed shift
reminder" (de and en) carry the labels of the block. `apps/web/src/settings/__tests__/readiness-selection.test.tsx`
proves the three rows, the checkbox state for a saved row, the instance-channel
fallback, the missing checkboxes for an unconfigured channel and the shape of
the PUT body.

**WP-M14-35 and WP-M14-36 — the ticket statuses become configuration (done).** The
status of a ticket is a machine key of the `ticket_statuses` table (migration `0034`,
`PLAN.md` §7): `names` (jsonb `de`/`en`), `color`, `position`, `active` and `is_terminal`
are rows the administration maintains and `apps/api/src/db/seed/statuses.ts` seeds the
nine statuses idempotently on the direct API start. The fixed-key CHECK of WP-M14-35
contradicted its own goal, so migration `0040_ticket_status_key_format.sql` replaced it
with a key-format CHECK (`^[A-Z][A-Z0-9_]{0,39}$`, the rule ADR-0023 states for stage keys).
**WP-M14-36** answers `GET`/`POST`/`PATCH`/`DELETE /api/v1/admin/statuses` behind
`settings.read`/`settings.write` over `apps/api/src/tickets/status-service.ts` and
`status-routes.ts`: the answer carries `ticketCount`, an unknown key is `404 status_not_found`,
a malformed body `400 invalid_request` with the field paths, a taken key `409 status_key_taken`,
a status a ticket still carries `409 status_in_use` with its number and the last active status
is never switched off or deleted (`409 status_last_active`); the key of an existing status is
immutable. `apps/api/src/tickets/__tests__/status-management.integration.spec.ts` proves it.
**WP-M14-37 — the status administration UI (done).** `apps/web/src/admin/status-page.tsx`
(`StatusPage`, route `/admin/statuses` behind `RequireSession`) renders the `ticket_statuses`
table of WP-M14-35 — key, the names de/en, the colour with a swatch, the position, the active
and terminal flags and the `ticketCount` — behind `settings.read`; `settings.write` adds the
create form and the per-row edit and delete buttons. A delete first asks for confirmation and
a rejected one names its code (`409 status_in_use`, `409 status_last_active`).
`apps/web/src/admin/status-form.tsx` (`StatusForm`) creates or edits one status and validates
the body client-side against the shared schemas of WP-M14-36 before the request — the key of
an existing status never enters an edit body. The settings menu gained the entry `statuses`
(`auth.links.statuses` in de and en). `apps/web/src/admin/__tests__/status-page.test.tsx`
proves the table, the guards, the forms and both rejects. WP-M14-38 … WP-M14-41, WP-M14-54 and
WP-M14-70 … WP-M14-72 stay open in numeric order.
**WP-M14-38 is drafted, not implemented yet** (out of band in phase 14, the follow-up of
WP-M14-37): the steps of the workflow become configuration. WP-M14-35 made the
statuses rows, but the steps stayed the code map `TRANSITIONS` in
`apps/api/src/tickets/workflow.ts`, so a status the administrator adds has no step
into it and none out of it — and the CHECK `tickets_status_check` of migration `0004`
still limits `tickets.status` to the nine keys. ADR-0025 decides the shape:
`ticket_transitions` (migration `0041`) with `from_status` and `to_status` as foreign
keys to `ticket_statuses.key` (`ON DELETE cascade`), `event_key` unique per
`from_status`, the nullable `condition_json` stored now and evaluated only by WP-M14-41,
the wildcard `cancelled` expanded into one row per status, the 22 rows of `PLAN.md` §7
seeded idempotently by the migration (plus the nine status rows the keys need) and the
old `tickets_status_check` dropped. The split is **WP-M14-38a** (the table),
**WP-M14-38b** (the shared contracts and `readTicketTransitions`/`resolveTransition`)
and **WP-M14-38c** (`transitionTicket()` reads the table); the three documents exist in
this commit and run in numeric order before WP-M14-39.
**WP-M14-38a is implemented** (the first child of WP-M14-38): migration
`0041_ticket_transitions.sql` creates `ticket_transitions` (`id` UUID v7, `from_status`
and `to_status` as foreign keys to `ticket_statuses.key` with `ON DELETE cascade`,
`event_key` unique over `(from_status, event_key)`, the nullable `condition_json`,
`active`) and seeds the 22 steps of §7 plus the nine default statuses idempotently;
`tickets_status_check` of migration `0004` is dropped (ADR-0025 decision 5), `apps/api/src/db/schema.ts`
mirrors the table as `ticketTransitions` and the journal reaches `0041`. WP-M14-38b and
WP-M14-38c stay open in numeric order.
**WP-M14-38b is implemented** (the second child of WP-M14-38): `packages/shared/src/schemas/ticket.ts`
carries the row contract of §7.13 — `TicketTransition { id, fromStatus, toStatus, eventKey, condition, active }`
behind `ticketTransitionSchema`, both statuses bound to the key format of `ticketStatusKeySchema`,
the event key bound to `ticketTransitionEventKeySchema` (`^[a-z][a-z0-9_]{0,39}$`, the form of
the events of §7) and the code `transition_not_found` — and `apps/api/src/tickets/transition-service.ts`
reads the rows of `ticket_transitions` (active and inactive, ordered by `from_status` and `event_key`)
through `readTicketTransitions(database)` and resolves one step purely through
`resolveTransition(transitions, fromStatus, eventKey)`, answering `undefined` for an unknown or
inactive combination — `transitionTicket()` of WP-M14-38c loads the rows once per call and decides
the error there. No create, update or delete function (WP-M14-39) and no evaluation of `condition`
(WP-M14-41); the engine still reads the code map `TRANSITIONS` until WP-M14-38c. WP-M14-38c stays
open in numeric order.
**WP-M14-38c is implemented** (the third child of WP-M14-38): `transitionTicket()` in
`apps/api/src/tickets/workflow.ts` loads the rows once per call with
`readTicketTransitions(database)` and resolves the step with `resolveTransition(transitions,
fromStatus, event)`; `undefined` throws the existing `INVALID_TRANSITION` (409 `invalid_transition`
with `from` and `event` in `params`), the UPDATE inside the transaction still re-checks
`status = <from>` (`PLAN.md` §12) and the workflow columns stay keyed by `event_key` — the new
status comes from the `to_status` of the row. `TRANSITIONS` and `TRANSITION_EVENT_KEYS` stay
exported only as the escalation layer's view (WP-M14-40 and WP-M14-41 move it onto the table).
The new `apps/api/src/tickets/__tests__/transition-table.integration.spec.ts` proves on a migrated
database that `NEW` reaches `IN_REVIEW` through `review_started`, that an event without a row
answers 409, that a row set to `active = false` blocks its step and that an edited `to_status`
moves the ticket to the status the row names. WP-M14-39 (the transition administration API) and
WP-M14-39b (its UI) stay open in numeric order.
**WP-M14-39 is implemented** (the follow-up of WP-M14-38c): `apps/api/src/tickets/transition-service.ts`
gains `createTicketTransition`, `updateTicketTransition` and `deleteTicketTransition` next to the
read of WP-M14-38b, `apps/api/src/tickets/transition-routes.ts` answers `GET`/`POST`/`PATCH`/`DELETE`
`/api/v1/admin/transitions` behind `settings.read`/`settings.write` and `apps/api/src/index.ts`
registers them: a malformed body answers `400 invalid_request` with the field paths (both status
keys bound to `ticketStatusKeySchema`, the event key to `^[a-z][a-z0-9_]{0,39}$`), a status key
that names no row of `ticket_statuses` answers `400 invalid_status_key` with its field (the foreign
keys of migration `0041` are the database backstop of that rule), a `POST` or `PATCH` that would
duplicate the unique index `(from_status, event_key)` of that migration answers `409 transition_duplicate`
with the pair and an unknown `id` answers `404 transition_not_found`; the `id` of an existing row is
never edited and no step count blocks a delete (ADR-0025 keeps the trade-off of an empty workflow
visible in the UI). `apps/api/src/tickets/__tests__/transition-management.integration.spec.ts`
proves it. WP-M14-39b (its UI) stays open in numeric order.
**WP-M14-39b is implemented** (the UI of the transition administration): `apps/web/src/admin/transition-page.tsx`
(`TransitionPage`, route `/admin/transitions` behind `RequireSession`) renders the `ticket_transitions`
table of WP-M14-38a — the row identity, `from_status` → `to_status`, the `event_key` and the `active`
switch — behind `settings.read`; `settings.write` adds the per-row edit and delete buttons and the
create form (`TransitionForm` in the same module), which validates both status keys against
`ticketStatusKeySchema` and the event key against `ticketTransitionEventKeySchema` client-side before
the request of WP-M14-39 sees the body. A delete first asks for confirmation in a dialog and a
rejected one names its code (`404 transition_not_found`), a step that would duplicate the unique
`(from_status, event_key)` index answers `409 transition_duplicate` and a status key that names no
row of `ticket_statuses` answers `400 invalid_status_key`. ADR-0025 keeps the trade-off of an empty
workflow visible: without rows the page shows `admin.transition.emptyNotice`. The administration
group of the settings menu gained the entry `transitions` (`auth.links.transitions` in de and en).
`apps/web/src/admin/__tests__/transition-page.test.tsx` proves the table, the guards, both forms,
the confirmation dialog, the two rejects and the empty-workflow notice. WP-M14-40, WP-M14-41,
WP-M14-54 and WP-M14-70 … WP-M14-72 stay open in numeric order.
**WP-M14-40 is implemented** (the database layer of the `status_change` escalation action): the
planned package mixed database, contract, engine and UI over the four-file limit of `PLAN.md` §17
and named the taken migration number `0036` (that number belongs to
`0036_notification_verification.sql`), so it is split in this commit into **WP-M14-40** (database),
**WP-M14-40b** (the shared contract and the engine) and **WP-M14-40c** (the administration UI) —
the three documents exist here and run in numeric order. Migration
`0042_escalation_action_status_change.sql` drops `escalation_actions_type_check` of `0031` and
recreates it with the fourth type `status_change`, widening the CHECK without touching a row of an
installed database; `apps/api/src/db/schema.ts` mirrors it and the journal reaches `0042`. The
target status lives in the `config` jsonb (`{ toStatus }`) — jsonb can carry no foreign key, so the
service validates it against `ticket_statuses` in WP-M14-40b (the rule of WP-M14-39
`400 invalid_status_key`); `specs/07-escalation.md` §7.5 gains the `status_change` row and §7.12
replaces the boundary „the escalation never changes a ticket state" with the rule that only such an
action moves the status, through a step of the `ticket_transitions` table of WP-M14-38a (ADR-0025).
WP-M14-40b, WP-M14-40c, WP-M14-41, WP-M14-54 and WP-M14-70 … WP-M14-72 stay open in numeric order.
**WP-M14-40b is implemented** (the shared contract of the `status_change` action and the engine that
performs it): `ESCALATION_ACTION_TYPES` gains `status_change` and the discriminated union of
`packages/shared/src/schemas/escalation-config.ts` gains the variant `{ key, type: 'status_change',
toStatus, condition }` with `toStatus` bound to `ticketStatusKeySchema`. `apps/api/src/escalation/config.ts`
maps the action onto the `config` jsonb (`{ toStatus }`) in `actionConfig` and `writeEscalationConfig`
rejects a target that names no row of `ticket_statuses` with `400 invalid_status_key` and the field path
`rules.<i>.actions.<j>.toStatus` — the service rule of WP-M14-39, now on the escalation side, because
the jsonb of WP-M14-40 can carry no foreign key. `apps/api/src/escalation/actions.ts` performs the step:
a `status_change` action whose condition matches finds the **active** row of `ticket_transitions` that
leads from the current status of the ticket to the target (`readTicketTransitions`), runs it through
`transitionTicket()` (`actorKind: 'system'`, the payload carries the rule and the stage, never a contact),
appends one `escalation_note` event `{ rule, stage, from, to }` and counts the move in the `statusChanged`
counter of `EscalationActionResult`; without such a step the action changes nothing. The shared unit test
of the new variant, the fired-rule case of `apps/api/src/escalation/__tests__/actions.integration.spec.ts`
(status moved once, the step event and the note written, a second scan a no-op) and the `400 invalid_status_key`
of `config-routes.integration.spec.ts` prove it. WP-M14-40c, WP-M14-41, WP-M14-54 and WP-M14-70 …
WP-M14-72 stay open in numeric order.
**WP-M14-40c is implemented** (the administration offers the `status_change` action): `apps/web/src/admin/escalation-page.tsx`
reads the statuses with the existing administration route `GET /api/v1/admin/statuses` (WP-M14-36,
`settings.read`) as a TanStack query and passes the **active** status keys into `RuleForm` and on into
`EscalationActionEditor`. `apps/web/src/admin/escalation-action-editor.tsx` renders the new type with its
label and a single-select target-status field (`admin.escalation.action.statusTarget`) over those keys;
`shapeOf` and `actionOf` carry `toStatus` and the client validates the key with `ticketStatusKeySchema`
before the request, so an existing status key never enters an invalid body. The labels `admin.escalation.action.types.status_change`
("Status change") and `admin.escalation.action.statusTarget` ("Ziel-Status"/"Target status") are added to the
`settings` namespace in `de` and `en`. `apps/web/src/admin/__tests__/escalation-actions-editor.test.tsx`
proves the option, the target select over the configured statuses (the inactive one is not offered), that the saved
body carries `toStatus` and that a `status_change` action without a target stays unsaved. WP-M14-41, WP-M14-54 and WP-M14-70 …
WP-M14-72 stay open in numeric order.
**WP-M14-41 is implemented** (the time of the day becomes a condition of an escalation rule):
`escalationConditionLeafSchema` in `packages/shared/src/schemas/escalation-config.ts` gains the leaf
`time_of_day` with the operators `in`/`notIn` and the interval value `HH:MM-HH:MM`
(`TIME_OF_DAY_INTERVAL_PATTERN`, a single interval or an array of them), and `evaluateEscalationCondition()`
evaluates it against the wall clock of `Europe/Berlin` — the display timezone of `PLAN.md` §Time, which
resolves the WP's open question: neither the server timezone nor UTC — through the helpers
`wallClockMinutes()`, the DST-safe `minutesOfDay()` (`date-fns-tz`) and `timeOfDayIntervalMatches()` in
`packages/shared/src/escalation.ts`: the start of an interval is included, its end excluded, so
`06:00-22:00` and `22:00-06:00` split day and night and an interval may cross midnight
(`22:00-00:00` reaches midnight); an interval that names no clock time never matches. `EscalationFacts`
gained the optional `timeOfDay` fact — the unit tests pass it explicitly and the escalation engine
without that fact falls back to the current wall clock. `specs/07-escalation.md` §7.4 carries the new
row and its semantics, the label `admin.escalation.condition.fields.time_of_day` (`de`/`en`) keeps the
field of the condition builder localized and `packages/shared/src/__tests__/escalation.test.ts` proves
the match inside and outside an interval, the midnight transition, the array of intervals, an
impossible interval and a malformed leaf. No route, database or migration change — a rule already
stores its condition as `condition_json`. **WP-M14-54 is implemented** (the own
channels page names the channel administration, out of band in phase 14):
`apps/web/src/settings/notifications-page.tsx` renders one `Link` to
`/admin/channels` under the header hint with the label
`notifications.administration.link` — text only, no permission check, no extra
fetch — and the ntfy fallback branch (no QR because the instance has no target)
names the destination as a second line with the same link and the hint
`notifications.administration.hint`; `de` and `en` of `apps/web/src/i18n/locales/*/common.json`
gain the two keys (`Kanal-Administration (Administration → Channels)` /
`Channel administration (Administration → Channels)`), `specs/10-notifications.md`
§11.12 records the one-page-per-direction cross-link next to the `personalLink`
of WP-M14-48, and `apps/web/src/settings/__tests__/notifications-page.test.tsx`
asserts both links and the translated label. `apps/web/src/admin/channels-page.tsx`
is untouched — its link exists already. WP-M14-70 … WP-M14-72 stay open in numeric order.
**WP-M14-70 is implemented** (the setup script of the ntfy access control list and the
token): `scripts/ntfy-setup.sh` runs every ntfy command inside the container of the
profile over `docker compose --profile ntfy exec --no-tty ntfy ntfy …` (ADR-0024 point 3),
so the host needs no ntfy CLI. It refuses without a Docker daemon, without `.env`, while
the container is not running (`ntfy config check`) and while
`ntfy config read auth-default-access` is not `deny-all` — it never widens a looser
server. It creates the user `stoerdesk-api` with role `user` only when `ntfy user list`
does not know it, then sets `ntfy access stoerdesk-api "stoerdesk-*" read-write` and
`ntfy access everyone "stoerdesk-*" read-only` — idempotent, a second run changes
nothing, and the anonymous read entry is what lets a phone subscribe through the QR
code without a login (ADR-0024 point 6). Only while the `NTFY_TOKEN` line of `.env`
is empty it runs `ntfy token add stoerdesk-api`, keeps the printed `tk_…` value in a
variable and writes it into `.env` with a `sed` on that single key; the token is never
printed, never logged and a non-empty `NTFY_TOKEN` is kept and never shown (ADR-0024
consequence: the token is a secret of the class of `POSTGRES_PASSWORD`). `package.json`
gained `npm run ntfy:setup` as `sh scripts/ntfy-setup.sh` (the pattern of `update:host`).
`sh -n` and shellcheck are clean (only the `CDPATH= cd` idiom warning `scripts/update.sh`
carries too); the manual check on a running profile (403 anonymous publish to
`stoerdesk-pruef`, 200 with the token, 403 anonymous read of `anderes`) is **unverified**
— this development container has no Docker daemon. WP-M14-71 … WP-M14-72 stay open in
numeric order.
**WP-M14-71 is implemented** (the Cloudflare Tunnel profile of the ntfy server, ADR-0024
points 4 and 5): `docker-compose.yml` gained the service `cloudflared` with
`profiles: [tunnel]`, image `${CLOUDFLARED_IMAGE:-cloudflare/cloudflared}` (pinned),
command `tunnel --no-autoupdate run`, network `backend`, `depends_on: ntfy` with
`required: false`, the json-file logging of the stack and **no** `ports:` entry — the
tunnel is the only public path, the ntfy container stays without a host port.
`TUNNEL_TOKEN` comes from `CLOUDFLARE_TUNNEL_TOKEN`, required with `:?` as the
`POSTGRES_PASSWORD` line does, so a missing token stops `docker compose config` with
a clear message instead of starting a silent tunnel. `.env.example` gained `CLOUDFLARED_IMAGE`
and an empty `CLOUDFLARE_TUNNEL_TOKEN` with a comment that the public hostname of the
tunnel must point to `http://ntfy:80` (the hostname itself is `NTFY_HOSTNAME`, announced
by WP-M14-69). `docs/DEPLOYMENT.md` (Notifications) names the ntfy profile as the
exception of "StörDesk ships no notification servers" (ADR-0024 consequence), documents
start, setup script and tunnel and says that the tunnel is the only public path. No
DNS and no tunnel creation through an API: the operator creates the tunnel in the
Cloudflare dashboard and copies its token (non-goal of the WP); no Cloudflare Access
policy. `docker compose --profile ntfy --profile tunnel config` is **unverified** —
this development container has no Docker daemon; locally both files were checked to
parse (the `yaml` package and Prettier). WP-M14-72 stays open in numeric order.
**WP-M14-72 is implemented** (the random ntfy topic per user and the backup of the
ntfy volume, ADR-0024 point 6 and consequences): `apps/api/src/notifications/accounts.ts`
exports `newNtfyTopic()` — `stoerdesk-` plus 16 random bytes as hex (128 bits,
`node:crypto`, matching the `stoerdesk-*` ACL entry of WP-M14-70) — and `storeAccount`
replaces an empty `externalId` of an ntfy account with that topic: the server creates
the subscription topic, the client never picks it. `ntfyRecipients` in
`apps/api/src/notifications/receivers.ts` answers the **stored** topics of the users
who selected ntfy only — the `stoerdesk-<userId>` fallback is gone, a user without an
ntfy account receives no ntfy message (`userTopic` stays exported for the internal
paths of `outbox.ts`, where the creator's own row still falls back to the derived
topic). An existing account with a derived topic keeps working until the user
reconnects over the QR and gets a random topic; the number of such accounts is a
SQL count over the instance database (`SELECT COUNT(*) FROM notification_accounts
WHERE channel = 'ntfy' AND external_id = ('stoerdesk-' || user_id::text)`) —
unverified here, this development container has no instance database. The `backup`
service of `docker-compose.yml` mounts the volume `ntfydata` read-only at
`/data/ntfy` and archives it into `stoerdesk-<stamp>-ntfy.tar.gz` (the ntfy user
database with the access control list travels with the instance; ntfy stores the
API token hashed, so the archive carries no plaintext token).
`apps/api/src/notifications/__tests__/receivers.unit.spec.ts` proves the prefix and
the 128 random bits, that a user without an account contributes no topic and that
the topics stay deduplicated; the fixtures of `outbox.unit.spec.ts` and of
`phase14-exit.integration.spec.ts` reconnect user B with a stored random topic
instead of a derived one. `docker compose config` is **unverified** (no Docker CLI/daemon
here, the compose file parses as YAML and the mount of `ntfydata` stays declared).
**WP-M14-72b — the subscription QR shows the stored topic (done).** The
subscription route `GET /api/v1/notifications/accounts/ntfy` in
`apps/api/src/notifications/routes.ts` answers the **stored** `external_id` of the
ntfy account of the session user (a `select` over `notificationAccounts` bounded
by the session user id and the `ntfy` channel, drizzle-bound like the read of
`storeAccount`); the derived `stoerdesk-<userId>` topic is no longer a valid
subscription (WP-M14-72 removed the fallback in `ntfyRecipients`, so a phone at a
derived topic receives nothing). A user without an ntfy account is provisioned
through `storeAccount` with a fresh random topic from `newNtfyTopic()` — visiting
the QR connects the user (ADR-0024 point 6: the server owns the subscription topic,
the client never picks it); a repeat visit keeps the stored topic and writes
nothing. An unconfigured ntfy server still answers the empty subscription. The
extended `apps/api/src/notifications/__tests__/routes.unit.spec.ts` proves the
stored topic, the provisioning of a `stoerdesk-`-prefixed 128-bit random topic and
the stable topic over two visits. Phase 14 has no open follow-up left.
**WP-M14-58 is drafted and implemented** (out of band in phase 14, asked by
the office): the number of escalation stages becomes configurable. Today
`PUT /api/v1/escalation/stages` only renames, reorders and deactivates the five
fixed keys and ADR-0017 forbids any other stage. ADR-0023 supersedes that one
decision: a stage is a row with a free `key`, a nullable `predecessor` and a
`reached_by` event list, the whole stage set is replaced in one transaction and
validated as a chain, the clock of a stage comes from its predecessor (or from
`received_at` when there is none) and removing a stage removes its rules through
a foreign key with `ON DELETE cascade`. The announced split is **WP-M14-59 …
WP-M14-67** (database → shared contracts → seed → stage-set API → engine →
available stages → administration UI → texts → exit criterion); the files of
that split exist in the same commit. They run after the open phase-14 items in
numeric order, and WP-M14-35 and WP-M14-38 (configurable statuses and
transitions) are prerequisites for the stages reaching new workflow events.

**Every notification links to its ticket (WP-M14-68, out of band in phase 14,
requested by the office; done).** The office asked that every sent message —
Telegram, ntfy and the other channels — carries the link to the ticket it is
about. §11.5 already demanded "the deep link into the ticket", but every adapter
linked `env.PWA_URL`: the root of the PWA. `drainOutbox` now hands
`ticketDeepLink(env.PWA_URL, target.ticketNo)` — `<pwa-url>/tickets/<ticket-number>` —
to `NotificationChannel.send` as `deepLink` and `apps/api/src/notifications/channels/index.ts`
passes it to the adapters, so the ntfy `view` action and the `<label>: <url>` deep
link of Telegram, Matrix, Signal, e-mail, web push and WhatsApp point into the
ticket of the row (also on a fallback row of the escalation chain). The link
carries the ticket number only — no `status_token`, no credential, no contact
data; the PWA root stays the fallback of an older row without a ticket number and
of a test message. The readiness link to `/oncall` (ADR-0021) stays with
WP-M14-28.

**WP-M14-21 — the exit criterion of the messenger channels (done).** The integration
test `apps/api/src/notifications/__tests__/phase14-exit.integration.spec.ts` runs the
real API on a throwaway database and proves the three rules of the precedence of
§11.4 — the account of a user is used (a stored ntfy account topic wins over the
derived `stoerdesk-<userId>` topic), the selection of the user decides the channels
of `ticket.created` (the users who selected ntfy get one per-user row each, a user
without a selection gets none, the instance topic is replaced), and the mandatory
minimum channels of a critical ticket are queued whatever the selection says (a
normal ticket keeps only the selection, a critical ticket adds the configured
minimum channel exactly once) — the warning of §11.8 (a failed channel shows up in
`GET /api/v1/notifications/status` as `failed ≥ 1` with a `lastFailedAt` and no
pending row, and the drain continues to the next channel of the chain with a
`notification_sent` fallback row), and the secrecy rule of §11.13 (the access token
of the ntfy channel and the Matrix token travel only in the `Authorization` header —
never in an answer, a log, an event payload or the published body).

**Phase 14 has started** (WP-M14-01): the standalone administration home at
`/admin` is gone. Every administration module is a link of the settings menu at
`/settings`, the retired address `/admin` redirects there and the texts of the
removed page (`settings:admin.home.*`, `common:auth.links.admin`) are deleted
in `de` and `en`. **WP-M14-02** turns the back links of the administration and
the settings pages to the settings menu and names them "Zurück zu den
Einstellungen" / "Back to settings". **WP-M14-03** is the working plan of the
messenger channels of the phase: `specs/10-notifications.md` carries the
reviewed contract, ADR-0019 decides that the configuration of the channels and
the accounts of the users live in the database, ADR-0020 decides that WhatsApp
Web is an external bridge of the operator. The phase is split into
**WP-M14-04 … WP-M14-21**: the configuration in the database, the
configuration API, the administration page, the content of a message, the
accounts, the linking of Telegram, Matrix and WhatsApp Web, the ntfy
onboarding, the selection of the channels per event type, the mandatory
minimum channels of critical tickets, the warning on a failed channel, the
notifications of the internal creation and the exit criterion. **WP-M14-04** is
implemented: migration `0033_notification_channel_config.sql` (0032 was already
taken by the escalation webhook event) gives `notification_channels` the columns
`kind` (unique), `enabled`, `label`, `config` (jsonb) and the write-only `secret`
and creates the tables `notification_accounts` and `notification_preferences` of
`specs/10-notifications.md` §11.3 and §11.4; `apps/api/src/notifications/config.ts`
answers the effective configuration with
`readChannelConfiguration(database, env)` — a row wins over the environment, a
kind without a row keeps its environment values, a disabled channel is not
configured — and carries `secretSet` instead of the secret (ADR-0005 rule).
**WP-M14-15** links the WhatsApp Web account over the external bridge of the
operator (ADR-0020): `apps/api/src/notifications/whatsapp-linking.ts` reads the
chats of the bridge with `readBridgeStatus(config)` over `GET {baseUrl}/status`
and answers `{ connected, chats: [{ id, label }] }` — a missing base URL, an
unreachable bridge, a non-ok answer and an invalid JSON answer all resolve to
`{ connected: false, chats: [] }` and never an error of the administration (§11.6);
the bearer of the row `whatsapp` of `notification_channels` (with the
`WHATSAPP_BRIDGE_URL` / `WHATSAPP_BRIDGE_TOKEN` environment fallback) travels only
in that request and never into an answer, a log or an error message (§11.13).
`GET /api/v1/notifications/accounts/whatsapp/status` (session) answers those chats
and `POST /api/v1/notifications/accounts/whatsapp` (session) stores the chat id the
user picked as the account via `storeAccount` of WP-M14-08 — a chat the bridge does
not know is refused with `422 invalid_request` and nothing is written; the own
channels page shows the state of the bridge, its chats, the account of the user and
the button to remove it. There is no pairing inside StörDesk — that stays in the
bridge (ADR-0020). **WP-M14-16** gives the selection of the channels per event
type an API: `apps/api/src/notifications/preferences.ts` reads and writes the
rows of `notification_preferences` — one row per user, event type and channel —
with `readPreferences(database, userId)` and `writePreferences(database, userId,
selection)`, where a write deletes the rows of the user and inserts the given
selection in one transaction, so the selection of another user is never touched.
`GET` and `PUT /api/v1/notifications/preferences` are session-only: the answer
and the body are `{ preferences: [{ eventType, channel }] }` and the accepted
values are the seven event types of `specs/10-notifications.md` §11.4 (ADR-0021)
and the channel kinds of §11.1 — an unknown event type or channel is a `422
invalid_request` and writes nothing. The shared contracts in
`packages/shared/src/schemas/notification.ts` name those event types and the
selection; the check of `notification_preferences` in the database still knows
the four ticket types and migration `0034` of WP-M14-27 widens it to the seven.

**WP-M14-17** renders that selection on the own channels page: one row per event type of the seven of §11.4 (ADR-0021 — the four ticket events and the three readiness events) with the channels as checkboxes — a channel that is not configured (the enabled channels of `GET /api/v1/admin/channels`) is not offered and a configured channel without a linked account of the user is marked as such; the selection is read from and replaced with one `PUT /api/v1/notifications/preferences` (WP-M14-16, no change of that API) and the section shows the saved state; the hint names the rule of the precedence of §11.4 — the escalation rule of the admin decides the channels of an escalation and the mandatory minimum channels of a critical ticket are added to every event (the minimum channels themselves are WP-M14-18) — and the texts are added in `de` and `en`.
**WP-M14-18** is implemented as well: the settings row `notifications.minimum_channels` holds the channel kinds every critical ticket is notified through, `GET/PUT /api/v1/settings/notifications/minimum-channels` answers and replaces it behind `settings.read` and `settings.write` (`apps/api/src/settings/notifications.ts`), a channel of the list that is not configured is a `422 invalid_request` so the setting never promises a delivery that cannot happen (§11.9), and `enqueueOutbox` adds those channels to the rows of a `critical` ticket on top of the selection of the user without queueing a channel twice; the administration page shows the checkboxes of the configured channels. **WP-M14-19** makes a failing channel visible: `GET /api/v1/notifications/status` (§11.8, §11.11) answers the pending rows, the failed rows, the time of the last success and the time of the last failure per channel over `resolveChannelStatus` of the dashboard service — the shared contract `channelStatusListResponseSchema` of `packages/shared/src/schemas/notification.ts` binds that answer — `apps/web/src/admin/channels-page.tsx` lists the failing channels with their last failure and the number of the failed rows, and the settings menu (`apps/web/src/settings/settings-page.tsx`) shows a badge with the number of the failing channels until every channel works again; the warning is never only the list of one page, the dashboard tile and the `notification_failed` event of the ticket history stay the other carriers. The status lines of WP-M14-18 and WP-M14-19 and the backlog rows of `work-packages/README.md` are updated in this commit (WP-M14-18 landed without them), WP-M14-56 and WP-M14-57 gain their backlog rows. **WP-M14-22** (out of band in phase 14, requested by the office): the e-mail
view and the pdf view of a ticket become one prepared send view — the ticket
detail header replaces the envelope icon with a paper plane ("Versenden" /
"Send") that opens `/tickets/:ticketNo/send`; the prepared view carries the
two buttons "Als PDF speichern" and "E-Mail versenden" on top, shows all
history events in full and keeps every block (event row, photo, field
section) clear of page-break cuts, so nothing is truncated in the printout
and the photos appear on screen and in print; the former
`ticket-email-page.tsx`, `ticket-pdf-page.tsx` and their routes are gone.
**WP-M14-34** (out of band in phase 14, requested by the office): a `mailto:`
body is text-only, so the "E-Mail versenden" button is removed (the send
returns later as a server-side WP) and "Kopieren (HTML)" (`copyPreparedHtml`)
copies the prepared ticket block to the clipboard with the browser's HTML
flavour — `execCommand('copy')` over a programmatic selection, `ClipboardItem`
as fallback — and the hint line names the paste step into the e-mail program;
the `email.*` texts leave `de` and `en`.

**Phase 13 is implemented** (WP-M13-01 … WP-M13-17, ADR-0017): the
five workflow milestones become the escalation stages, the deadlines per priority,
the conditions and the actions move into the database and are maintained in
`/admin/escalation`, the ticket view selects a stage instead of pressing one
button per workflow step, and the former manual stage catalogue (`ticket.escalation_stages`,
the `escalation_set` event, `POST /api/v1/tickets/:ticketNo/escalate`) is removed. The exit test `apps/api/src/escalation/__tests__/phase13-exit.integration.spec.ts` proves the criterion of the phase on a throwaway database: a stage rule fires once per threshold, its condition decides, the three actions write their rows, the deadline rules fire at 80 % and 100 % and the removed routes answer `404`.
**WP-M13-18** (out of band in phase 13) speaks the language of the interface on that
page: the stage headings take the stage name of the current language, the reference
events, the condition fields and operators, the action types and the channels show
their i18n label instead of the raw key and the broken German texts of the page are
repaired; the saved payload keeps its technical keys.
**WP-M12-09** is implemented — the ticket detail header carries the e-mail icon and
the cancel button and the way back to the list is gone. **Phase 12 is complete**:
**WP-M12-02** runs the acceptance suite `scripts/e2e-acceptance.mjs` over items 1–12
of §20 and prints `acceptance: 11/12 verified` — every provable item `PASS`, item 11
`UNVERIFIED` by design (no browser-side push registration). The run exposed and closed
one product defect: the workflow transition never wrote `acknowledged_at`, so the
timeline did not stop at acknowledgement; `transitionTicket` now writes the workflow
columns of §7 and the new `workflow-columns.integration.spec.ts` proves it.

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

| WP        | Content                                                             | Status |
| --------- | ------------------------------------------------------------------- | ------ |
| WP-M1-09e | login form, logout and route guard (web)                            | done   |
| WP-M1-10i | publish run label carries the commit subject                        | done   |
| WP-M1-10d | English ADRs and `docs/DECISIONS.md`                                | done   |
| WP-M1-11  | `docs/REPO-MAP.md` English and current                              | done   |
| WP-M1-12  | Playwright smoke test "login as admin works"                        | done   |
| WP-M1-13  | UI layout shell with header and navigation                          | done   |
| WP-M1-14  | base seed keeps an existing admin untouched                         | done   |
| WP-M2-00  | core object tables and demo seed                                    | done   |
| WP-M2-01  | object list CRUD API                                                | done   |
| WP-M2-02  | QR generation, regeneration, resolution                             | done   |
| WP-M2-02b | QR demo tokens and scheduled cleanup                                | done   |
| WP-M2-03  | printable QR sticker sheets (web print)                             | done   |
| WP-M2-04  | ticket tables, events, photos, counter                              | done   |
| WP-M2-04b | public report endpoint with idempotency                             | done   |
| WP-M2-04c | report photo upload (magic bytes, volume)                           | done   |
| WP-M1-15  | app version visible in the web shell                                | done   |
| WP-M1-16  | current git version in the deployment env                           | done   |
| WP-M1-17  | responsive shell with a settings gear                               | done   |
| WP-M2-05  | public report form at `/m/:token` (web)                             | done   |
| WP-M2-05b | photo upload with client compression                                | done   |
| WP-M2-05c | report form smoke E2E in de and en                                  | done   |
| WP-M2-06  | public status API by `status_token`                                 | done   |
| WP-M2-06b | public status page at `/s/:token` (web)                             | done   |
| WP-M2-07  | report throttle table and suspicion                                 | done   |
| WP-M2-07b | Altcha captcha API primitives                                       | done   |
| WP-M2-07c | spam decision on the report create path                             | done   |
| WP-M2-07d | honeypot field and Altcha widget (web)                              | done   |
| WP-M2-08  | duplicate hint: open tickets and public comment                     | done   |
| WP-M1-18  | publish chain without cancelled runs                                | done   |
| WP-M1-19  | one tag per push for every commit                                   | done   |
| WP-M1-20  | the push command in the governance documents                        | done   |
| WP-M1-21  | serialised promotion of `latest`                                    | done   |
| WP-M1-22  | the app version reads version tags only                             | done   |
| WP-M1-23  | record: login card and version display                              | done   |
| WP-M1-24  | record: RBAC/admin bootstrap on API start                           | done   |
| WP-M1-25  | record: CI database tests, publish queue                            | done   |
| WP-M1-26  | record: configurable login rate limit                               | done   |
| WP-M1-27  | record: the end-of-session commit rule                              | done   |
| WP-M1-28  | CI hardening: push guard, promote gate, deploy, no silent smoke     | done   |
| WP-M2-26  | back links in the admin pages                                       | done   |
| WP-M2-32  | record: the BMAcloud contract commit                                | done   |
| WP-M2-33  | BMAcloud read-only client and env                                   | done   |
| WP-M2-34  | `bma_sync_runs` table (migration `0007`)                            | done   |
| WP-M2-35  | BMAcloud sync service                                               | done   |
| WP-M2-36  | BMAcloud admin API and pg-boss job                                  | done   |
| WP-M2-36b | `GET` of the BMAcloud schedule pair                                 | done   |
| WP-M2-37  | BMAcloud sync page (web)                                            | done   |
| WP-M2-38  | sync card on the administration home                                | done   |
| WP-M2-39  | external badge in the object list                                   | done   |
| WP-M2-40  | fault template archive schema and contracts                         | done   |
| WP-M2-40b | fault template admin and public catalog API                         | done   |
| WP-M2-40c | fault template administration UI                                    | done   |
| WP-M2-40d | fault template entry on the admin home                              | done   |
| WP-M2-40e | report form uses the live fault catalog                             | done   |
| WP-M2-40f | internal create and detail live catalog                             | done   |
| WP-M2-41  | bootstrap standard fault types                                      | done   |
| WP-M2-41b | E2E fault-chip labels of the bootstrap list                         | done   |
| WP-M2-42  | bootstrap of the standard fault types                               | done   |
| WP-M2-43  | self-update decision (ADR-0004) and spec 18                         | done   |
| WP-M2-44  | admin update page: clean PWA update (stage 1)                       | done   |
| WP-M2-45  | BMAcloud bearer key in `settings` + admin routes (ADR-0005)         | done   |
| WP-M2-46  | the scheduled pull reads the effective bearer key                   | done   |
| WP-M2-47  | API-key field on the BMAcloud sync page                             | done   |
| WP-M2-48  | host update agent decision (ADR-0006) and work plan                 | done   |
| WP-M2-49  | shared contracts: `system.update` and the update schemas            | done   |
| WP-M2-50  | the `update_runs` table and migration `0009`                        | done   |
| WP-M2-51  | the update agent service core (`apps/agent`)                        | done   |
| WP-M2-52  | the update agent HTTP server                                        | done   |
| WP-M2-53  | the agent image, compose service and env wiring                     | done   |
| WP-M2-53b | the compose invocation of the agent and its image in the smoke test | done   |
| WP-M2-54  | the admin update API                                                | done   |
| WP-M2-55  | the host update section in the admin update page                    | done   |
| WP-M2-56  | documentation of the host update                                    | done   |
| WP-M2-57  | the status route names the reason of an unreachable agent           | done   |
| WP-M2-58  | the page shows why the agent is not reachable                       | done   |
| WP-M2-59  | the agent generates its own token (state volume)                    | done   |
| WP-M2-60  | the API reads the token from the state volume                       | done   |
| WP-M2-61  | the admin page carries the guide for the host update                | done   |
| WP-M2-62  | documentation of the token without the environment                  | done   |
| WP-M2-63  | the update availability check                                       | done   |
| WP-M2-64  | `objects.external_type` (migration `0010`)                          | done   |
| WP-M2-65  | BMAcloud contract for the Anlagentyp                                | done   |
| WP-M2-65b | the sync writes `external_type`                                     | done   |
| WP-M2-66  | the system type column of the object list                           | done   |
| WP-M2-68  | the run carries the failure output of the agent                     | done   |
| WP-M2-69  | `update_runs.error_detail` and the API answer                       | done   |
| WP-M2-70  | the page shows the failure output                                   | done   |
| WP-M2-71  | the host update works in panel (Arcane) deployments                 | done   |
| WP-M2-72  | the host update runs as a shell script without the agent            | done   |
| WP-M2-73  | the panel build fetches the current sources                         | done   |
| WP-M2-74  | the page shows the version and starts with a button                 | done   |
| WP-M2-75  | `ticket.delete` permission key (admin only)                         | done   |
| WP-M2-76  | `ticket_purges` append-only log of hard-deleted tickets             | done   |
| WP-M2-77  | `DELETE /api/v1/tickets/:ticketNo` for cancelled tickets            | done   |
| WP-M2-78  | "Endgültig löschen" button on the ticket detail page                | done   |
| WP-M3-02  | the update script removes the images it replaces                    | done   |
| WP-M3-02b | the update agent removes the images it replaces                     | done   |
| WP-M3-03  | the agent start command finds the project dir on the host           | done   |
| WP-M3-04  | the start command pins `--project-directory` and fills `.env`       | done   |
| WP-M3-04b | der Startbefehl bricht ohne `docker-compose.yml` ab                 | done   |
| WP-M3-05  | shared error code `update_step_timeout` for self-update           | done   |
| WP-M3-06  | the update agent run can never hang forever                       | done   |
| WP-M3-07  | the update contract (spec §18, ADR-0007) and the GitHub client     | done   |
| WP-M3-08  | the update API: `check` and `start` with the environment keys      | done   |
| WP-M3-09  | the deployment configuration of the update control                  | done   |
| WP-M3-10  | the update menu in the shell header                                | done   |
| WP-M3-11  | the removal of the update agent                                   | done   |
| WP-M3-12  | the documentation of the new update control                        | done   |
| WP-M5-01  | the outbox stores queued internal actions (Dexie v2)               | done   |
| WP-M5-02  | `internal_action_receipts` table and migration 0013                | done   |
| WP-M5-03  | `applyInternalAction`: replay-safe acknowledge/comment/decline     | done   |
| WP-M5-04  | `clientUuid` on the action routes + internal comment route         | done   |
| WP-M5-05  | the detail page queues actions offline and replays them            | done   |
| WP-M5-06  | conflict UI: failed and conflicting offline writes stay visible    | done   |
| WP-M5-07  | stale-while-revalidate cache for internal ticket reads             | done   |
| WP-M5-08  | offline internal actions E2E — phase 5 exit criterion              | done   |
| WP-M5-09  | sign-out clears the `internal-tickets` cache                       | done   |
| WP-M7-01  | ntfy channel adapter and its env wiring                            | done   |
| WP-M7-02  | ntfy channel unit test                                             | done   |
| WP-M7-03  | ntfy QR code, onboarding and i18n label                            | done    |
| WP-M7-04  | outbox rows in the ticket create transaction                       | done   |
| WP-M7-04b | the localized ntfy action label                                    | done   |
| WP-M7-04c | the outbox drain worker, its retries and its pg-boss schedule      | done    |
| WP-M7-05  | the notification channel fallback chain                                      | done    |
| WP-M7-06  | the phase-7 exit criterion and record                                        | done    |
| WP-M7-07  | the e-mail channel adapter over SMTP (nodemailer, ADR-0009)               | done    |
| WP-M7-08  | the Telegram channel adapter over the Bot API (`fetch`)                   | done    |
| WP-M7-09  | the Web Push (VAPID) channel adapter over `web-push` (ADR-0010)          | done    |
| WP-M11-01 | detected errors — specification, ADR and phase-11 split                  | done    |
| WP-M11-02 | `detected_errors`-Tabelle und `tickets.detected_error_keys`              | done    |
| WP-M11-03 | API CRUD `/api/v1/detected-errors`                                       | done    |
| WP-M11-04 | Close-Route akzeptiert Kommentar und festgestellte Fehler                | done    |
| WP-M11-05 | Statistik: `byDetectedError` und View-Erweiterung                        | done    |
| WP-M11-06 | Admin-UI `DetectedErrorsPage` (CRUD, archivieren)                        | done    |
| WP-M11-07 | Ticket-Detail Close-Panel mit festgestellten Fehlern                     | done    |
| WP-M11-08 | Statistik-UI `byDetectedError`-Chart                                     | done    |
| WP-M11-09 | Integrationstests (API, Close, Statistik)                                | done    |
| WP-M11-10 | Phase-11 Exit-Kriterium und Record                                       | done    |

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

Phase 3 is **complete**. Its features were implemented early under phase 2 — the PWA shell
and outbox (**WP-M2-09**), the service worker and automatic replay (**WP-M2-09a**) and the
offline E2E "flight mode, send, online, exactly one ticket" in `de` and `en`
(**WP-M2-09b**) — so the phase 3 entry in the roadmap above is backed by shipped code.
The closure filled the previously placeholder `specs/09-offline.md` with the shipped
contract (outbox, `client_uuid` idempotency, replay triggers, PWA shell, failure behaviour
and the explicit boundary to the offline internal actions of the later phases) and found
one defect: the Workbox background-sync route compared the bare `/v1/public/tickets` while
the app requests `/api/v1/public/tickets`, so the queue never matched. **WP-M3-01** moves
the predicate into `apps/web/src/lib/sw-routes.ts`, matches the API base and covers it with
a unit test. The offline E2E of WP-M2-09b passes against a real throwaway database and a
real Chromium; `npm run check` and `npm run build` are green.

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
→ `docker image prune -f`) is implemented as the chain **WP-M2-48 … WP-M2-56**. **WP-M2-48** fixes
the topology with **ADR-0006**: the update agent is a service of the **same** compose project
behind the profile `update` — a plain `docker compose up -d --build` skips it, so the agent
survives the redeploy it triggers — mounted with the checkout and the Docker socket and
reachable only on the internal network with the bearer `UPDATE_AGENT_TOKEN`. The chain then
implements the shared contracts (`system.update`, **WP-M2-49**), the `update_runs` table
(**WP-M2-50**), the agent service with its three steps (**WP-M2-51**), the agent protocol
(**WP-M2-52**), the image and the compose wiring (**WP-M2-53**, **WP-M2-53b**), the admin API
(**WP-M2-54**), the page section (**WP-M2-55**) and the documentation (**WP-M2-56**) — one
commit per work package. The API stays a client: it never runs `git`, `docker` or a shell.

The host update in the field showed what the rebuild leaves behind, and **WP-M3-02**
fixes it: `docker compose up -d --build` moves the fixed `:latest` tags of
`docker-compose.yml` to the new images, so every update turned the previous image of
`api`, `web` and `update-agent` into a tagless one, while the only cleaner was
`docker image prune -f` with the `com.docker.compose.project` **image** label — a label
a build from a remote build context, the `docker-compose` v1 fallback and an aborted
build never write. `scripts/update.sh` now snapshots the image ids it owns before the
rebuild and removes by id whatever no container of the project and no current tag needs,
keeps the labelled prune as best effort, rebuilds with `--remove-orphans`, never prunes
unscoped and clears an existing backlog with `--cleanup` and `--gc`
(`STOERDESK_GC_UNTIL`). **WP-M3-02b** ports that clean-up into the agent: it
snapshots the image ids of the three owned names before the rebuild, removes by
id whatever neither a current tag nor a container of the project needs, keeps the
labelled prune as its last best-effort command and never prunes a time window —
`--gc` stays a property of the script.

The same field report showed a second trap: the start command of the update button
changed into `com.docker.compose.project.working_dir`, and under Arcane that label holds
the path **inside the panel container** (`/app/data/projects/stoerdesk`) while the folder
sits on the host in the data volume of the panel. **WP-M3-03** first mapped that label
through the bind mounts of the running containers; **WP-M3-04** replaced the whole
discovery, because the operator already stands in the project folder: the command keeps the
project name from the `com.docker.compose.project` label, pins the folder with
`--project-directory "$PWD"` and fills only the missing `POSTGRES_PASSWORD` /
`SESSION_SECRET` of the project `.env` from the running `api` container
(`docker exec … printenv`, `umask 077`) — the compose file needs that file, because `api`
declares `env_file: .env`. `scripts/update.sh` keeps requiring a real checkout: the panel
path is the agent path. **WP-M3-04b** finally guards the start command: if the current
directory has no `docker-compose.yml`, it exits with `exit 1` and a clear message before
`docker compose` or the `.env` are touched. **WP-M3-05** puts the fixed error code
`update_step_timeout` into the shared update schema and the administration labels.
**WP-M3-06** adds a deadline to every step of the run: `git pull`, the compose rebuild
and the image clean-up each run against `UPDATE_STEP_TIMEOUT_MS` (default ten minutes).
A step that passes its deadline fails with `update_step_timeout`, the run reaches
`finishedAt` and the agent state leaves `running` — `lastRun` no longer shows `Läuft`
for a build that never comes back.

**The update control is replaced (WP-M3-07 … WP-M3-12, ADR-0007).** The host update
agent needed a second, privileged container next to the application: the Docker socket of
the host, `git` and the Docker CLI in the image, a state volume and a start command
whose path differs per deployment panel. The operator of this instance already runs a
deployment tool, so the application only has to know *that* a newer commit exists and
*that* the operator wants it. **WP-M3-07** writes the contract (`specs/18-self-update.md`
§18.1–§18.7) and the decision (ADR-0007, ADR-0006 is superseded) and adds the read-only
client of the GitHub API. **WP-M3-08** adds `GET /api/v1/admin/update/check` (the
installed version, the newest commit of the branch, the commits behind it, the answer
cached for a minute) and `POST /api/v1/admin/update/start` (the check runs again on the
server, the deploy webhook is called with the header `X-Deploy-Token` and a body the
server builds itself, `202 { started: true }` immediately, a second start inside five
minutes refused). **WP-M3-09** gives the image the build argument `GIT_COMMIT` and the
tracked `VERSION` file, the compose file the keys `GITHUB_REPO`, `GITHUB_BRANCH`,
`GITHUB_TOKEN`, `UPDATE_WEBHOOK_URL` and `UPDATE_WEBHOOK_TOKEN` plus
`host.docker.internal:host-gateway`. **WP-M3-10** makes the version badge of the shell
header the entry point: for a user with `system.update` it is a button that opens the
update panel, the page `/admin/update` is gone. **WP-M3-11** retires the agent — the
workspace `apps/agent`, the compose service `update-agent`, the `agent` target of the
`Dockerfile`, the keys `UPDATE_AGENT_*` and the volume `update-state` are gone;
`scripts/update.sh` stays the manual path of the operator. **WP-M3-12** documents the
new control in `docs/DEPLOYMENT.md`, `docs/REPO-MAP.md` and this section. The tokens
belong to the API: they never reach the browser, a log line or the repository.

Phase 4 is **complete** with a single package: **WP-M4-01** drives the whole workflow
(review → work order → assign → accept → acknowledge → close) as one Playwright test in
`de` and `en` and asserts the `ticket_events` chain after every transition; it announced no
follow-up. Phase 5 (offline internal actions) then had no work packages at all —
`specs/09-offline.md` §9.6 only named the topic — so the split required by §16 happened
before any code: **WP-M5-01 … WP-M5-09** in `work-packages/m5/` cover the Dexie v2 internal
action queue, the `internal_action_receipts` table, the replay-safe `applyInternalAction`
helper, the `clientUuid` idempotency on the acknowledge/decline routes plus the internal
comment route, the offline queue and conflict UI, the stale-while-revalidate ticket reads,
the E2E of the exit criterion and the cache clear on sign-out. **All of WP-M5-01 … WP-M5-09
are implemented** (the Dexie v2 `internal_actions` queue with its replay triggers and
`pendingWrites`, the receipts table, the idempotent helper, the action routes, the queue
and conflict UI, the offline reads, the E2E and the cache clear), which closes phase 5.
Claiming from the pool and
shift confirm/decline stay out of phase 5 (online-only rule of §9.6; on-call is phase 8).

**Phase 6 is complete**: **WP-M6-01** … **WP-M6-13** are implemented (timeline contracts, per-priority
deadlines, `ticket_pauses`, escalation rules and scan, the pg-boss job, the timeline data in the
ticket API, the web timeline bar, the list mini timeline). **WP-M6-13** closes the phase with the
exit-criterion integration test "overdue ticket escalates and appears in the history" against the
real API on a throwaway database. The phase-6 exit criterion — an overdue ticket escalates with
`rule = deadline_exceeded`, the ticket detail timeline turns `red`, and a second escalation scan
adds no event — is proven by `apps/api/src/tickets/__tests__/escalation-exit.integration.spec.ts`.
The administration menu of the deadlines was missing after that record: **WP-M6-14** (shared
deadline and reaction schema), **WP-M6-14b** (`GET/PUT /api/v1/settings/deadlines`, 6/6 integration
tests against PostgreSQL), **WP-M6-15** (`/admin/deadlines` page) and **WP-M6-16** (route and the
available menu entry) implement the per-priority hours and the reaction minutes of ADR-0008. The
per-object-type deadlines (Objektart) are not part of phase 6: no spec or ADR defines them, so they
stay an open decision (§19) until an ADR exists.
Phase 7 (notifications) starts with its `m7` packages: **WP-M7-01** and **WP-M7-02**
are implemented (the ntfy channel adapter, its `configuredChannels` entry and its unit test),
and **WP-M7-03** is implemented as well — `apps/web/src/features/settings/NtfySubscription.tsx`
renders the subscription QR of `${NTFY_PUBLIC_URL}/${NTFY_TOPIC}` with the `ntfy://<topic>`
deep-link switch and the labels `ntfy.subscribe`, `ntfy.qrLabel` and `ntfy.appHint` in the
`common` namespace (`de` and `en`), props with a `VITE_NTFY_PUBLIC_URL` / `VITE_NTFY_TOPIC`
build fallback (no API route, non-goal of the WP) and an empty card while the channel is
unconfigured. **WP-M7-04** is implemented as well: `0019_notification_outbox` adds the
`outbox`, `notification_channels` and `push_subscriptions` tables (the `state` check
`PENDING`/`SENT`/`FAILED`, `attempts` default `0`, the `outbox(state, created_at)` index,
`notification_channels` and `push_subscriptions` are rows only, no routes), `notifications/outbox.ts`
exposes `enqueueOutbox(database, ticket, env)` that inserts one `PENDING` row per channel of
`configuredChannels(env)` with no HTTP call, and `report.ts` calls it inside the create transaction
after the ticket and its `created` event — the row carries only the machine-readable message
parameters `{ ticketNo, priority, objectName }` (no photo, no contact data), so a channel failure can
never lose the event. Its announced follow-up was split before any code was written
(`PLAN.md` §17: the worker needs `outbox.ts` next to the direct-start wiring in `index.ts`,
which exceeds the four-file budget together with the label files): **WP-M7-04b** is
**implemented** as the localized ntfy `view` action label — `server.{de,en}.json` gained
`notification.action_label` (`Öffnen` / `Open`) and `NtfyConfig` gained the optional
`locale` of the shared `ServerLocale`, so the label of a payload is
`t(locale, 'notification.action_label')` and the hard-coded German literal of WP-M7-01 is
gone. The remaining half is **WP-M7-04c** (`work-packages/m7/04c-outbox-drain-worker.md`,
**planned**): the worker that drains the rows oldest first with three retries and backoff,
writes `SENT`/`FAILED`, appends the `notification_sent`/`notification_failed` ticket events
and is scheduled per minute from the direct API start only. **WP-M7-05** (`work-packages/m7/05-channel-fallback-chain.md`,
**implemented**) adds the second half of the exit criterion: `drainOutbox` takes the next
channel of `escalationChain(env)` (the configured channels in `configuredChannels` order)
when a row exhausts its three attempts, ends it `FAILED` with its `notification_failed`
event and queues one `PENDING` fallback row with the same ticket and the same machine-readable
target params in the same transaction — unless the ticket already has a pending row for that
channel, so a channel is never notified twice — and the drain claims it in the same run;
`OutboxDrainResult` gained `fallback` and the log code `channel_fallback`. **WP-M7-06** (`work-packages/m7/06-phase-7-exit-criterion.md`,
**implemented**) closes the phase: `notification-exit.integration.spec.ts` drives the
real API on a throwaway database — the only `PENDING` row of a ticket sits on the
failing signal channel, `drainOutbox` ends it `FAILED` after three attempts, queues
the `PENDING` fallback row of the next channel of `escalationChain` in the same
transaction, claims it in the same run and ends it `SENT` on a local Matrix mock —
and the `GET /api/v1/tickets/:ticketNo` answer carries exactly one
`notification_failed` (`attempts: 3`) and one `notification_sent` event next to the
`created` event, a second drain writes no event and no row and the last channel of
the chain ends `FAILED` without a fallback. The phase-7 exit criterion — "channel
failure retries and falls back; history shows it" — is proven by that test; phase
7 is closed, no product code changed.

**Phase 7 continued — the e-mail channel (WP-M7-07).** `PLAN.md` §16 lists SMTP in the
content of phase 7 and `PLAN.md` §12 lists it as an external channel, so WP-M7-07 adds the
fourth channel to the chain: `apps/api/src/notifications/channels/email.ts` sends the
notification over SMTP with `nodemailer` (ADR-0009 — the plan fixed no SMTP library and a
hand-written client cannot upgrade the `SMTP_PORT=587` STARTTLS default), keeping the adapter
shape of WP-M7-01 — `EmailConfig` from the existing `SMTP_*` keys, `EmailError` with the codes
`no_sender` and `send_failed`, the transport factory as injectable last parameter — and the
message content of WP-M7-04 (subject `message.title`, body plus a `\n\n<label>: <pwaUrl>`
deep link labelled `t(locale, 'notification.action_label')`, no photo, no contact data).
`configuredChannels(env)` gained the `email` entry, configured only when `SMTP_HOST` and
`SMTP_FROM` are both set, appended last, so the escalation chain of WP-M7-05 is now
signal → matrix → ntfy → email; `drainOutbox`, `escalationChain` and migration `0019` needed
no change. Telegram and Web Push (VAPID) keep their own WPs, and the user choice of channels
per event type plus the mandatory minimum for `critical` (§12 admin rule) stay unimplemented.

**Phase 7 continued — the Telegram channel (WP-M7-08).** `PLAN.md` §12 lists Telegram as an
external channel and the `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` keys are already part of the
environment, so WP-M7-08 adds the fifth channel to the chain:
`apps/api/src/notifications/channels/telegram.ts` posts the notification as JSON (`chat_id`,
`text`) to `sendMessage` of the Telegram Bot API with plain `fetch` — no library, no ADR, the
transport of ntfy and Matrix — keeping the adapter shape of WP-M7-07 (`TelegramConfig` from the
`TELEGRAM_*` keys, `TelegramError` with the codes `no_token` and `http_error`, `fetch` as its
injectable last parameter) and the message content of WP-M7-04 (`${title}\n${body}` plus a
`\n\n<label>: <pwaUrl>` deep link labelled `t(locale, 'notification.action_label')`, no photo,
no contact data). `configuredChannels(env)` gained the `telegram` entry — configured only when
both keys are set — appended last, so the escalation chain of WP-M7-05 is now signal → matrix
→ ntfy → email → telegram; `drainOutbox`, `escalationChain` and migration `0019` needed no
 change. Web Push (VAPID) keeps its own WP and the Telegram account linking via a one-time code
 (§12) stays unimplemented.
 
 **Phase 7 continued — Web Push (WP-M7-09).** The last channel announced in §12 is Web Push
 (VAPID) for installed PWAs, so WP-M7-09 adds the sixth adapter:
 `apps/api/src/notifications/channels/web-push.ts` delivers `${title}\n${body}` plus the
 deep link labelled `notification.action_label` through the `web-push` library
 (ADR-0010 — encrypted payloads and VAPID JWT signing are not hand-written locally);
 `WebPushConfig` reads `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` — enabled
 only when all three are set — `sendWebPushNotification` throws `WebPushError('no_keys')`
 without keys and wraps transport failures as `send_failed`, never leaking endpoint,
 keys or the private key; an empty subscription list is a successful no-op. The chain entry
 in `channels/index.ts` reads the `push_subscriptions` rows of WP-M2-95 (endpoint, p256dh,
 auth) over a short-lived database pool, so the escalation chain of WP-M7-05 is now
 signal → matrix → ntfy → email → telegram → webpush. The PWA push registration
 (subscribe in the web app, `notification_permissions` and the admin failure warning of
 §12), per-event channel selection and `pushUrl` as an escalation parameter stay
 unimplemented.
 
**Repair — red CI runs of WP-M4-07 / WP-M7-02 / WP-M7-03 / WP-M7-04 / WP-M7-04b
(v1.0.25 … v1.0.29).** WP-M4-07 moved every workflow action into one dropdown menu but
never wired body-less actions (review, assign, accept, close) nor "`Zurück zur Liste`",
so the phase-4 and phase-5 E2E exit criteria were red against a real database and
Chromium — `npm run check` skips e2e locally without those prerequisites (a skipped
gate is never presented as green, §18.2), which is why the check looked green before
push. The repair commit makes the checks green end to end (`npm run check`,
`npm run build`, E2E 14 passed against a throwaway database): the dropdown performs
body-less actions on confirmation, navigates back to the ticket list via "`Zurück zur
Liste`", the confirm inputs are addressable by `name`, and the E2E specs drive the
dropdown instead of the removed buttons. Phase 7 continues with **WP-M7-04c**.

**Out-of-band phase 2 — the klarmname columns (WP-M2-93).** `users.given_name` and
`users.family_name` are text, `NOT NULL`, default `''`, length ≤ 64, stored trimmed, with
`users_name_idx` over `lower(family_name), lower(given_name)` and the helper
`derive_user_family_name()` behind migration `0018_user_klarmname`; the seed derives the
same family name and never invents a given name (`email` stays the login key). Its
announced follow-up **WP-M2-94** (`work-packages/m2/94-user-name-fields-api.md`) carries
the names into the shared user schemas and the admin user API and is **planned**.

**Deploy safety — the pre-migration dump (WP-M3-17, out-of-band phase 3).** The API
applies pending Drizzle migrations in its container `CMD`, so a broken migration reaches
the production database before the server answers and an image rollback does not undo
it. `docker-compose.yml` therefore gained the one-shot service `db-backup-pre-migrate`
(no profile, Postgres image, `backups` volume): it writes and verifies
`/backups/pre-migrate-<stamp>.sql.gz`, and `api` depends on it with
`condition: service_completed_successfully`. A failed or empty dump stops the deployment
before any migration runs; `BACKUP_RETENTION_DAYS` also bounds these dumps. The periodic
`backup` profile service is unchanged. `npm run check` and `npm run build` are green; the
Docker commands of §18.1 are unverified in this container (no Docker daemon).

**Phase 8 is split and started (WP-M8-01, WP-M8-02).** Phase 7 is complete, so the roadmap moves
to phase 8 (on-call calendar). The phase had no work packages and `specs/04-oncall.md`
was a placeholder, so the split required by §16 happened before any code: **WP-M8-01**
fills the slice, resolves the open swap-approval decision with ADR-0011 (approval
defaults to `true`, local wall-clock weeks in `Europe/Berlin`, group-based pool
membership, `oncall.default_pool_id`, stateless iCal token) and names **WP-M8-02 …
WP-M8-16** in `work-packages/m8/`, implemented in numeric order: tables (02), DST slot
math (03), pools (04), planning service (05), shift/settings routes (06),
confirm/decline (07), swap service (08), swap routes (09), ticket coupling (10), offer
timeout (11), iCal (12), admin page (13), my-shifts page (14), offline shift actions
(15) and the exit criterion (16). The exit criterion "DST tests and atomic swap tests
pass" is proven by WP-M8-16; the dashboard tile stays in phase 9.

**On-call ticket coupling (WP-M8-10).** `apps/api/src/oncall/coupling.ts` resolves the
responsible technician for an instant: `resolveOnCallPerson` picks the default pool
(`oncall.default_pool_id`, otherwise the first active pool by lower-case name) and a
covering `CONFIRMED`/`SWAP_REQUESTED` shift before a `PLANNED` one, otherwise answers
`unstaffed`. `offerTicket` replaces the generic `offered` route: in one transaction it
moves `WORK_ORDER_CREATED` to `OFFERED`, sets `offered_to_user_id` and
`offer_escalated_at = now + oncall.escalate_to_group_after_min` for a staffed shift,
clears both when unstaffed, and appends the `offered` event with `onCall`, `shiftId` and
`poolId` (plus `warning = oncall_unconfirmed`/`oncall_unstaffed`). The route accepts an
optional `poolId` (`400 invalid_request` for a malformed id). `GET
/api/v1/oncall/warnings` (`oncall.read`) answers the unstaffed (`UNFILLED`/`DECLINED`)
shifts inside `oncall.unfilled_warning_days`, the `PLANNED` shifts starting within
`oncall.reminder_unconfirmed_h`, and the resolved default pool.

**On-call offer timeout (WP-M8-11).** `escalateOnCallOffers(database, now)` in
`coupling.ts` selects `OFFERED` tickets with a non-null `offered_to_user_id` and an
`offer_escalated_at` at or before `now`. In one transaction per ticket it clears
`offered_to_user_id`, resets `offer_escalated_at` and appends one `offer_escalated`
event with `{ reason: 'oncall_timeout' }`. A ticket already cleared or no longer
`OFFERED` is skipped, so a repeat scan is a no-op. `evaluateEscalations` runs the
sweep before the rule scan and reports `offerScanned`/`offerEscalated`; the existing
`ticket-escalation` job therefore carries it every minute without a second queue.

**Phase 8 is complete (WP-M8-02 … WP-M8-16).** The on-call calendar is implemented in
numeric order: tables and migration `0020` (02), the DST-safe slot generator (03), the
pool API (04), the settings and planning service (05), the shift/settings routes (06),
confirm and decline (07), the atomic swap service (08) and routes (09), ticket coupling
(10), offer timeout (11), the personal iCal feed (12), the admin page (13), the pending
swap list route (13b), the my-shifts page (14), the self-service read routes (14b),
offline confirm/decline (15) and the exit criterion (16). **WP-M8-16** proves the exit
criterion against a throwaway PostgreSQL: `generateOncallSlots` yields 167 h for the
spring DST week of 2026-03-23, 169 h for the autumn week of 2026-10-19 and 168 h for a
neutral week, and two concurrent acceptances of one `PENDING` swap produce exactly one
winner, the request `ACCEPTED` (approval on) or immediately effective (approval off),
one acceptance event and a `409` for the loser. The exit test also exposed that the
generator read the zoned wall clock with `getUTC*` while `fromZonedTime` reads local
fields; under the shipped `TZ=Europe/Berlin` that shifted every slot by the UTC offset.
The generator now uses local getters and `setDate`, so the DST rule holds under any
process time zone. The dashboard tile and statistics stay in phase 9.

**Phase 9 is split and started (WP-M9-01).** Phase 8 is complete, so the roadmap moves
to phase 9 (dashboard and statistics). The phase had no work packages and
`specs/11-dashboard.md` and `specs/12-stats.md` were placeholders, so the split required
by §16 happened before any code: **WP-M9-01** fills both slices with the reviewed
contract of §13 and resolves the open phase-9 decisions with ADR-0012 — an SSE stream
instead of a five-second polling probe, plain SQL views instead of materialized views, a
computed fault-free record, a stored rotatable token for the wall display `/tv/:token`,
`tickets.is_test` for test data, inline SVG charts and the threshold
`stats.conspicuous_threshold`. The phase is split into **WP-M9-02 … WP-M9-18** in
`work-packages/m9/`, implemented in numeric order: the test flag (02), the SQL views
(03), the shared contracts (04), the dashboard service (05), the dashboard route (06),
the SSE stream (07), the dashboard settings (08), the TV route (09), the statistics
services (10, 11), the statistics routes (12), the CSV export (13), the web dashboard
(14), the web statistics page (15), the web TV page (16), the web dashboard settings
(17) and the exit criterion (18). The exit criterion "counter resets on new ticket;
statistics match reference data" is proven by WP-M9-18. No product code in this
package.

**Data flag for test data (WP-M9-02).** Migration 0023 adds `tickets.is_test` as a
boolean column, not null with default false, and a partial `reported_at` index for
`is_test = false`. Drizzle declares `isTest`, so existing insert paths and future
statistics reads share the typed column. The ticket-table integration test proves
default false, explicit true, not-null rejection and the metadata of the column.

**Dashboard stream baseline order (WP-M9-39).** The SSE stream of `specs/11-dashboard.md`
§11.6 sent its first snapshot before it captured the probe baseline. A change that landed in
that window — the client reacts to the snapshot, the integration test inserts a ticket right
away — was swallowed: the baseline already contained it, the probe saw no difference and no
second snapshot followed. The baseline is now captured first, so every change after it is
visible to the probe. The defect was found while resolving the Dependabot pull request
`altcha-lib` 2.8.0, whose CI run failed on this timeout while the rest of the suite passed;
the same run proves the order, because the old order with a delayed baseline fails with the
same five-second timeout and the new order passes.

**Statistics services (WP-M9-10).** The statistics of §13 are read from the
`stats_tickets` and `stats_ticket_faults` views of WP-M9-03 (migration
`0025_stats_views` — WP-M9-03 numbered it `0024` before WP-M9-27 took
`0024_ticket_purges_append_only`). `apps/api/src/stats/filters.ts` turns the shared
filter of `specs/12-stats.md` §12.1 into a SQL predicate: the local days `from` …
`to` of `Europe/Berlin` become UTC instants with `date-fns-tz`, so a DST day keeps
its real length, `objectNo` matches case-insensitively, `systemType`, `priority` and
`technician` match exactly, and test and suspected-spam tickets stay excluded unless
the caller opts in. `apps/api/src/stats/reaction-times.ts` answers §12.2 with one
aggregate per phase (count, median, average, p90 in whole minutes) and reports the
paused tickets and the pause minutes next to the phases, never subtracted from them
(ADR-0012 decision 8). `apps/api/src/stats/frequency.ts` answers §12.3: the bucket
series (`day`, `week`, `month`, a week starts on Monday) is computed on the Berlin
local date of `reported_at` and zero-filled, and the `bySystemType`, `byFaultTemplate`
and `bySource` groupings count the same filtered set. The routes and the CSV export
follow in WP-M9-11 and WP-M9-12.

**Out-of-band phase 9 — the office view of the shipped app (WP-M9-19 … WP-M9-22).** The
office asked for a leaner dashboard and a denser ticket list. The work does not wait for
the phase-9 chain, because it changes the product the users see today and not the
contract of a later package. **WP-M9-19** removes the "Brennt jetzt" list from the start
page — the wall display keeps it (`specs/11-dashboard.md` §11.5) — and makes every tile
one link over its whole area; **WP-M9-20** orders the ticket list by the deadline, the
open tickets first and the finished ones behind them; **WP-M9-21** renders one line per
ticket with the mini timeline in the middle and the whole line as a link to the ticket.
The files of the three packages exist since the commit of WP-M9-19. **WP-M9-22** puts the
milestone markers of the ticket timeline onto the bar: the report marker is a whole dot
on the start point of the axis instead of a half dot above it, and the tooltip names the
milestone in the language of the interface.

**Out-of-band phase 9 — the title switch of the office (WP-M9-23 … WP-M9-25).** The office
asked that the menu entry "Titel bei Ticket erfassen" have a complete effect: a ticket
carries a title only while the switch is on, and the ticket view shows a title only while
the switch is on. **WP-M9-23** gives the `titleEnabled` flag of the branding row one
reading point (`apps/api/src/settings/branding-state.ts`) instead of four copies of the
same rule; **WP-M9-24** answers `title: null` in the ticket view while the switch is off
and offers `GET /api/v1/settings/title-switch` (`ticket.create`), and **WP-M9-25** renders
the title field of the internal creation form only while the switch is on — all three are
done.

**Out-of-band phase 2 — report time, channel and reporter kind of an internal report
(WP-M2-98 … WP-M2-98e).** The office must be able to record a fault that was reported
earlier (for example the previous evening) with its real report time, choose the channel
(phone, e-mail, messenger) and mark whether the report came from an internal employee or
an external reporter. **WP-M2-98** adds the reporter metadata columns and migration 0028,
**WP-M2-98b** teaches the internal create API the backdated `reportedAt` (future values are
rejected), the channel, the kind and an active internal user, **WP-M2-98c** builds the
three form sections and the reporter picker, **WP-M2-98d** shows report and capture time in
the timeline, and **WP-M2-98e** adds the report-time history row plus channel and kind to
the ticket detail. The public QR path and the external API stay unchanged.

**Out-of-band phase 9 — the record gap (WP-M9-26).** The commit `d1e34eb`
(`feat(web): object list facelift`) landed in the same chain without a work package and
without a WP id in its subject, so **WP-M9-26** is its retroactive record: the object list
rows lost the "extern gepflegt" badge of WP-M2-39 and the `Typ` column of WP-M2-66
(header, cells and the `externalTypeCategory` import left the DOM together), the edit and
the delete action became a flex row side by side and the keys `list.externalBadge`,
`list.externalHint` and `list.columns.type` were deleted in `de` and `en`. The data
contract stays: the API still answers `externalId` and `externalType`, the BMAcloud sync
still writes them and the object detail keeps the external information — the list simply
stopped presenting them. The record also corrects the off-by-one WP references of the
`branding-state.ts` module comment, the only place that ever named WP-M9-26 (the internal
creation gate is WP-M9-25, the ticket view gate WP-M9-24).

**Out-of-band phase 9 — security audit closure (WP-M9-27 … WP-M9-38).** The repeat pass
of the security audit (against `6351037`, diff `1ff37b1f..HEAD`, 181 files) found 17 open
items: areas A and B were re-checked in full, areas C–K only the changed files. **WP-M9-27**
starts the chain and makes `ticket_purges` append-only (audit SEC-013: migration `0024`
adds triggers that reject any `UPDATE`/`DELETE` of the purge log and cap `reason` at 1000
characters). The remaining findings follow in WP-M9-28 … WP-M9-38 in numeric order before
the next phase starts. **WP-M9-30** hardens the workflow, delete, photo and comment routes
(SEC-007 decline reason capped, SEC-008 decline uses `ticket.decline`, SEC-015 `ticketNo`
validated at every path parameter, SEC-017 raw PG message removed from `delete` response,
SEC-018 photo route permission-gated with a containment check and `Cache-Control: private,
no-store`). **WP-M9-31** runs the report photo preflight (count, data URL, decoded size,
magic bytes) before the ticket transaction (SEC-014), so an over-limit or bad-Type report
no longer leaves an orphan ticket row with reporter PII in the database. **WP-M9-32**
byte-checks the branding logo with the same `detectImageType` table the report photos
use (SEC-019), so a data URL whose bytes disagree with the claim is refused with
`400 invalid_request` before it enters the settings jsonb. **WP-M9-33** expires and re-
checks the iCal capability: the HMAC salt is a rolling 1-year bucket (max ~2 years per
token, one grace window), the route filters `users.active = true` and re-runs `loadEffectivePermissions`
against `oncall.read`, and `Cache-Control: no-store` plus a raised route `logLevel` keep the
token out of the JSON file log, `docker logs` and browser/proxy caches (SEC-005/SEC-011). **WP-M9-34**
enforces `SESSION_SECRET` at `.min(32)` (dev default still passes) and makes logout require
the session cookie before destroying, so a cross-site POST cannot force a logout (SEC-016). **WP-M9-35** removes the dead `prefix: '/api/v1/oncall'` option from the
`fastify-plugin` skip-override on-call pools registration (SEC-010). **WP-M9-36**
bounds the public comment route on the API side (SEC-004): the schema requires the ticket's
`statusToken` and a fresh `clientUuid`, the service rejects a mismatched status token with
`403 comment_status_token_mismatch`, replays the same `clientUuid` through `internal_action_receipts`
and reuses the report spam throttle (suspicious submissions carry `suspected_spam: true`
in the event payload). **WP-M9-37** threads the same fields through the web comment
path (SEC-004 web side): the form adds `clientUuid`, `website`, `verification` and
the reporter's own `statusToken` to the comment POST, and the module handles
`comment_status_token_mismatch` so a foreign open ticket shows the API notice. **WP-M9-38**
tightens the BMAcloud credentials GET (SEC-009) to `object.import`, matching PUT and DELETE.
The phase 9 audit chain WP-M9-27 … WP-M9-38 is now closed: every finding SEC-004 … SEC-020
of the repeat pass is fixed, and the only remaining open item in `.security/findings.md`
is SEC-011's `Cache-Control` header on the iCal feed (already delivered by WP-M9-33) —
the log redaction via Fastify `logLevel: 'warn'` is in place.

**Phase 9 is complete (WP-M9-02 … WP-M9-18).** Dashboard and statistics are
implemented in numeric order: the `tickets.is_test` flag (02), the two SQL views
(03), the shared contracts (04), the dashboard service, route and SSE stream
(05–07), the dashboard settings and the TV route (08–09), the statistics services
(10–11), the statistics routes and the CSV export (12–13), the live start page
(14), the statistics page (15), the wall display (16), the settings page (17) and
the exit criterion (18). The exit test
`apps/api/src/stats/__tests__/phase9-exit.integration.spec.ts` seeds an idempotent
reference set (`apps/api/src/db/seed-stats-reference.ts`) and proves `PLAN.md` §20
item 8 and item 9: a later `is_test = true` ticket and a later cancelled ticket do
not move the fault-free counter, a new qualifying report resets it, the review
median of the five real reference reports equals the printed 30 minutes, and the
`stats_tickets` view and the dashboard snapshot agree on the open and overdue
counts. Every skipped gate is reported as skipped; the PostgreSQL integration tests
skip with a named reason when no database is reachable, and the Docker smoke test
runs only in CI (§18).

**Phase 10 is split and started (WP-M10-01).** The phase had no work packages and
`specs/08-objects-api.md` §9.4–§9.5 as well as `specs/14-nfr.md` were placeholders,
so the split required by `PLAN.md` §16 happened first: WP-M10-01 fills the CSV
import and external REST API slice (`specs/08-objects-api.md`), the privacy,
retention, backup and restore slice (`specs/14-nfr.md`) and resolves the open
retention questions of phase 2 (`report_throttle.ip`, `bma_sync_runs.conflicts`)
with ADR-0014. ADR-0013 settles the external API: the same `/api/v1` paths accept
either the session permission or a bearer key with a scope; keys are stored only
as SHA-256 hashes and shown once; webhooks are a separate endpoint/delivery
subsystem with HMAC-SHA256 and exponential backoff; OpenAPI documents the external
surface under `/api/docs`. The phase is split into **WP-M10-02 … WP-M10-18** in
numeric order: API-key schema and contracts → admin routes → admin UI → bearer auth
→ OpenAPI → external object API → external ticket API → webhook endpoints → webhook
worker → webhook UI → CSV service → CSV route → CSV UI → retention job → privacy
export/erasure → uploads backup and restore drill → exit criterion. Implemented: **WP-M10-02 … WP-M10-18** — API-key schema, admin routes and page, bearer
authentication, OpenAPI, external object and ticket API, webhook endpoints, the
per-minute HMAC delivery worker, the webhook admin page with its OpenAPI paths,
the CSV import service and its two routes
(`POST /api/v1/objects/import/preview` and `POST /api/v1/objects/import` under
`object.import`), the CSV import page at `/objects/import` (WP-M10-14) and the
personal-data export and erasure routes (WP-M10-16), closed by the phase-10 exit
criterion (WP-M10-18). Phase 10 is complete. The CSV service parses comma or semicolon files
(quoted fields, 2 MB / 5,000 rows), maps the header case-insensitively through
the German aliases of §9.4, previews every row as `new`, `changed`,
`unchanged` or `error` and commits the valid rows in one transaction where a
row error never blocks the others and a repeated identical import writes
nothing. The two routes need a session with `object.import` — no bearer scope
reaches them — answer a malformed body or an unknown mapping target with `400
invalid_request` and the field paths, keep the preview write-free and return the
preview shape plus the `applied` counters on the commit route. The page at `/objects/import` reads the file in the browser and posts its text, shows the header mapping (the submitted mapping over the German aliases) with a control per column, keeps every row error in its preview line and adds the commit action with its `applied` counters; without `object.import` it stays read-only and the file never leaves the browser. The webhook chain stores the secret once, delivers `ticket.created` and
`ticket.status_changed` with the 1/5/25/125-second retry ladder and keeps the
delivery history after an endpoint is deleted. The daily 03:30 `privacy-retention`
job anonymises `reporter_name`, `reporter_phone` and `reporter_email` of tickets
closed at or before `now - privacy.contact_retention_months` (24-month default) in
batches of 500, removes the expired `ticket_photos` rows and their files below
`UPLOAD_DIR` after `privacy.photo_retention_months`, drops `report_throttle` rows
after 30 days and `bma_sync_runs` rows after 365 days, is idempotent, never touches
an append-only event row or a ticket row, logs the four aggregate counters only and
starts only from the direct API start (WP-M10-15).

**Personal-data export and erasure (WP-M10-16).** `apps/api/src/privacy/routes.ts` carries the
two session routes of `specs/14-nfr.md` §15.2, both guarded by `user.write` and reachable by no
API-key scope: `GET /api/v1/privacy/tickets/:ticketNo/export` answers the reporter contact fields,
the `ticket_photos` metadata and the audit rows as `{ type, actorKind, actorUserId, at }` — never
the `status_token`, never an event payload, so the export can never leave the internal notes of
another user — and `POST /api/v1/privacy/tickets/:ticketNo/erase` requires a trimmed reason of 5
to 1000 characters, sets `reporter_name`, `reporter_phone` and `reporter_email` to `NULL` in one
transaction and appends exactly one `personal_data_erased` event whose payload carries the reason
**length** and whose actor columns carry the admin (`reasonLength` only, never the reason text).
Idempotency is the event itself: a repeat finds that event, writes nothing and answers `200` with
`alreadyErased`; the ticket, its photos and its trail stay and full deletion remains the
`ticket.delete` path of WP-M2-77 (ADR-0014 decision 4). The shared contracts live in
`packages/shared/src/schemas/privacy.ts`.

**Uploads backup and the restore drill (WP-M10-17).** The `backup` profile now
mounts the `uploads` volume read-only and writes a pair every cycle: the
database dump `stoerdesk-<stamp>.sql.gz` and the uploads archive
`stoerdesk-<stamp>-uploads.tar.gz`; `BACKUP_RETENTION_DAYS` bounds both.
`docs/DEPLOYMENT.md` documents restoring database and uploads **of one cycle
together** — a `ticket_photos` row without its file is a broken ticket gallery
(ADR-0014 consequence). `scripts/restore-drill.sh` proves the pair on throw-away
targets: it starts the `db` and `backup` services of the real
`docker-compose.yml` in its own Compose project with its own volumes, seeds
rows and two photo files, waits until the profile wrote a dump + archive pair,
replays the dump into a fresh database and extracts the archive into a fresh
uploads volume, then compares the row counts and the photo manifest.
`scripts/docker-smoke.sh` runs the drill after the health checks, so the Docker
CI job proves it; without a usable Docker daemon the drill exits 1 reporting
itself `UNVERIFIED`, never green (ADR-0014 decision 6).

**Dashboard evaluations (WP-M10-19 … WP-M10-19b, out of band in phase 10).** The office
asked for evaluations in the dashboard's own view — average durations such as the
bearbeitung time — and explicitly leaves the worst reaction time out: it is neither
calculated nor displayed there. WP-M10-19 adds the `evaluations` block of
`specs/11-dashboard.md` §11.4a (ADR-0015) to the shared snapshot contract and
`resolveDashboardEvaluations` to the dashboard service: one `AVG`-only aggregate over
`stats_tickets` for the last 30 days of the counter's qualifying set — the three §12.2
phases and `averageProcessingMinutes` (`closed_at - reported_at`) as nullable whole-minute
averages; the query contains no median, p90 or max. The statistics API and statistics page
keep their p90 columns; `specs/12-stats.md` §12.10 names the block as the only allowed
addition. Its follow-up WP-M10-19b renders the block on the start page below the tiles
(one labelled line per average, `keine Daten` for a `null` average, no max/p90/median line)
with the labels under `dashboard.evaluations.*` in `de` and `en`.

**The dashboard of the wall display (WP-M10-30 … WP-M10-35, out of band in phase 10).**
The office asked for the start page to show what the wall display shows: first the
statistics, then the open tickets — with the last entry of the history and the timeline
in every row — and no readiness any more; the readiness becomes a page of its own with
the calendar of everybody who has it. The wording "Brennt jetzt" is gone: the category is
called "offene Tickets". WP-M10-30 gives every row of the snapshot the mini timeline of
`specs/05-timeline.md` §5.3 (`timelineState`, `percent`, `remainingMs`) and the last event
of the ticket (`lastEvent`), computed with the shared function and the same inputs as the
ticket list; WP-M10-31 writes the list once for both pages and drops the on-call panel of
the wall display; WP-M10-32 puts the statistics first on the start page and removes its
on-call tile; WP-M10-33 and WP-M10-34 build the readiness calendar and hang it above the
own readiness of `/oncall`; WP-M10-35 adds "Bereitschaft" to the header navigation.

**WP-M10-30** is implemented: every row of the snapshot's open-ticket list carries the
mini timeline of the ticket and the last entry of its history, the timeline computed with
the shared function and the same inputs as the ticket list. **WP-M10-31** writes the list
once for both pages — the new `OpenTickets` component — and drops the on-call panel of the
wall display; the wording "Brennt jetzt" is gone. **WP-M10-32** puts the statistics first on
the start page and removes its on-call tile; the snapshot keeps the section for the API.
**WP-M10-33** adds the readiness calendar of the office — the week of everybody who has the
readiness, with the pool, the person and the state of every shift — as the component the
on-call page hangs above the own readiness. **WP-M10-34** puts the calendar above the own
readiness on `/oncall` and adds the button to the administration of the readiness, visible
only with the permission `oncall.admin`. **WP-M10-35** adds "Bereitschaft" to the header
navigation: the entries are "Dashboard", "Tickets" and "Bereitschaft", the last one leads to
the readiness page `/oncall`. **WP-M10-36** removes the separate wall-display rendering:
the shared `DashboardDisplay` shows the same blocks on both surfaces, and on the wall no
link is active — a monitor is a display only.

**The readiness calendar becomes a real calendar (WP-M10-41, out of band in phase 10).** The
office asked for the current and the coming month as a calendar grid, one week per row from
Monday to Sunday, the calendar week numbers to the left of the grid and the state of a shift
recognisable from the colour of its day. `ReadinessCalendar` now renders two month tables
with an ISO week-number column and coloured day cells (confirmed green, planned amber, swap
requested purple, declined and unfilled rose, draft slate), keeps the technician name, the
pool and the state in every day cell and explains the colours in a legend. The two-month
window starts with the current month and moves by one month with the previous and next
buttons; the signature of the component, the API and the on-call page stay unchanged.

**The readiness allocation announces itself (WP-M14-26 … WP-M14-32, out of band in
phase 14).** The office complained that an assigned readiness cannot be accepted
and that the allocation of a shift never reaches the technician. **WP-M14-26**
writes the contract (`specs/04-oncall.md` §4a.3, §4a.4, §4a.9 and
`specs/10-notifications.md` §11.4, §11.5, §11.7, §11.10, §11.12, §11.14) and the
decision ADR-0021: the three readiness events `oncall.assigned`,
`oncall.swap_requested` and `oncall.unconfirmed_reminder` join the notification
events, the technician selects their channels for them in
`/settings/notifications`, the message names pool, start, end, state and the link
to `/oncall`, and a `DRAFT` readiness is confirmable. The children are planned:
**WP-M14-27** widens `outbox` (`event_type`, nullable `shift_id`, the exclusive
choice between `ticket_id` and `shift_id`) and the event check of
`notification_preferences` in migration `0034`, **WP-M14-28** adds the shared
readiness contracts, the shift enqueue and the shift branch of the drain,
**WP-M14-29** enqueues `oncall.assigned` on an allocation and
`oncall.swap_requested` on a swap request, **WP-M14-30** teaches `confirm.ts` and
the readiness page that a `DRAFT` readiness answers a confirm, **WP-M14-31** lets
the escalation scan enqueue one `oncall.unconfirmed_reminder` per unconfirmed
shift and **WP-M14-32** puts the readiness selection of the technician on
`/settings/notifications`. No product code in this package. **WP-M14-27**,
**WP-M14-28**, **WP-M14-29** and **WP-M14-30** are implemented: WP-M14-29 makes `createShift`
and the assign branch of `updateShift` in `apps/api/src/oncall/service.ts`
enqueue `oncall.assigned` for the technician in the transaction node the shift
write already uses, `requestSwap` in `apps/api/src/oncall/swaps.ts` enqueue
`oncall.swap_requested` for the requester and for a named target (a request to
the whole pool notifies only the requester) — all through `enqueueOncallOutbox`
of WP-M14-28, never in a channel call — and `assignedAnnouncementQueued` keeps
the announcement idempotent (a `PENDING` or `SENT` `oncall.assigned` row queues
nothing again); the new integration spec drives the real routes on a throwaway
database. **WP-M14-30** adds `DRAFT` to `CONFIRMABLE_STATES` in
`apps/api/src/oncall/confirm.ts` (`specs/04-oncall.md` §4a.4, ADR-0021), shows the
confirm button of a `DRAFT` readiness of the own technician on the readiness page
and extends the confirm integration spec with the `DRAFT` accept, its idempotent
repeat and the `409 oncall_invalid_shift_state` of a `DECLINED` and an `UNFILLED`
shift.

**The ntfy deep link carries the host (WP-M14-33, out of band in phase 14,
requested by the office).** The office wants the subscription QR of the own
channels page to land in the ntfy app and subscribe automatically. The ntfy
docs state that the app opens and subscribes a topic with the host-carrying
deep link `ntfy://<host>/<topic>` (a `https://<host>/<topic>/subscribe` is not
possible on Android) and that an insecure server takes the suffix
`?secure=false` — the payload `ntfy://<topic>` of WP-M7-03 and WP-M14-13
lacked the host. WP-M14-33 corrects the deep-link branch of `subscriptionValue`
in `apps/web/src/features/settings/NtfySubscription.tsx` and the `deepLink` of
the subscription answer of `GET /api/v1/notifications/accounts/ntfy`
(`apps/api/src/notifications/routes.ts`) to that documented form, the host
being the public server address without its scheme. **No credential enters the
QR or the deep link:** ntfy offers no URL-login scheme and ADR-0005 keeps every
secret write-only, so a protected topic is unlocked by a login in the ntfy app
itself — a scanned QR never carries a user name or a token. The card, the route
answer, the web-address branch, the adapter and the payload stay otherwise
unchanged.

**The ntfy access token reaches every send (WP-M14-51, out of band in phase 14,
requested by the office; WP-M14-52 and WP-M14-53 announced).** The office runs
its own ntfy server: the test send answered `403 Veröffentlichung verweigert`
because the request carried no access token. ADR-0022 decides that the access
token of the ntfy server is the write-only `secret` of the `ntfy` row with the
`NTFY_TOKEN` environment fallback (§11.2 gains no column, no key and no route);
`readChannelConfiguration` carries it as `ChannelConfiguration.token`, which is
not in `channelConfigurationSchema` and therefore never answered, and
`effectiveNtfyConfig`, the admin test registry and the `effectiveEnv` of the
drain hand it to the adapter so it travels only in the `Authorization` header —
never in a URL, a `?token=` parameter, a log, an answer or an error text.
**WP-M14-52** makes the administration name the access token in the `401` and
`403` texts (the claimed topic only as the second cause) and puts the
`Authorization: Bearer $NTFY_TOKEN` line into the copied curl; **WP-M14-53**
gives the publish request a timeout so an unreachable server answers
`http_timeout` instead of hanging the drain.

**The own channels page names the channel administration (WP-M14-54, out of band
in phase 14, requested by the office).** The office saw `Settings →
Benachrichtigungen` and `Administration → Channels` as one block with a lot of
repetition and asked whether that belongs together. It does not: §11.12 of
`specs/10-notifications.md` names both pages, the own page is the session layer
(§11.3 accounts, §11.4 selection) and the channel administration is the instance
layer (`notification.write`, the write-only secret of ADR-0005, the test send,
the minimum channels of §11.9); the repetition is intentional because §11.4
offers a checkbox only for a channel the instance has configured. What was
missing is the way back: WP-M14-48 links to the own page, the own page only
links to `/settings`. **WP-M14-54** adds one link line to `/admin/channels` on
`/settings/notifications` — the pages are never merged.

**The channel test send and the verification request carry a JSON body (WP-M14-55,
out of band in phase 14, requested by the office; done).** The office saw
`admin.channels.errors.FST_ERR_CTP_EMPTY_JSON_BODY` on the ntfy card: the test
message and the one-time code never reached the API, so the target stayed
*unverified* and produced no outbox row. Removing the separate ntfy test topic
dropped the request body while the page kept sending
`content-type: application/json`, and Fastify 5 rejects an empty body with that
content type before the route runs. **WP-M14-55** sends `{}` as the body on both
requests; the routes, their schemas and the saved row as test target (WP-M14-51)
stay as they are.

**ntfy becomes an optional Compose profile (WP-M14-69, out of band in phase 14,
requested by the office; done).** ADR-0024 decision 1 puts the self-hosted ntfy
server next to the `backup` profile instead of shipping it always. **WP-M14-69**
adds the service `ntfy` to `docker-compose.yml` with `profiles: [ntfy]`, the
image pinned by `${NTFY_IMAGE:-binwiederhier/ntfy}`, the command `serve`,
`restart: unless-stopped`, the json-file logging of the other services and the
`backend` network **without a `ports:` entry** — a deployment that does not
select the profile starts nothing and keeps the external ntfy path of `NTFY_URL`
and `NTFY_PUBLIC_URL` (decision 7). `ntfy/server.yml` is mounted read-only at
`/etc/ntfy/server.yml` and carries `auth-file: /var/lib/ntfy/user.db`,
`auth-default-access: deny-all`, `behind-proxy: true` with
`proxy-forwarded-header: CF-Connecting-IP` (decision 5) and `base-url:
${NTFY_BASE_URL}` substituted by ntfy from the environment of the container; the
named volume `ntfydata` holds `/var/lib/ntfy`. `.env.example` gains
`NTFY_IMAGE`, `NTFY_BASE_URL` and `NTFY_HOSTNAME` next to the empty
`NTFY_TOKEN`. No secret is in a file of the repository; the access token is
created in the volume by the setup script of WP-M14-70. The core services `db`,
`api`, `web` are unchanged. `docker compose config` with and without
`--profile ntfy` stays **unverified** in the development container (no Docker
daemon); CI runs the Docker smoke test instead.

**WP-M14-73 — the phase-14 record is closed (done).** Phase 14 is complete: all
80 packages of `work-packages/m14/` are implemented, the two exit criteria of
the phase are proven by their integration tests — WP-M14-21
(`apps/api/src/notifications/__tests__/phase14-exit.integration.spec.ts`: the
selection of the user decides the channels of a ticket, the mandatory minimum
channels of a critical ticket are queued whatever the selection says, a failed
channel warns and the chain continues, and no secret of a channel or of an
account leaves the server) and WP-M14-67
(`apps/api/src/escalation/__tests__/stage-chain-exit.integration.spec.ts`: the
configurable stage chain replaces the fixed stages of ADR-0017) — and no
follow-up is open. The four phase-14 documents WP-M14-23 … WP-M14-26 still
carried `status: planned` although their packages landed long ago (the commits
`604e9d8`, `8e7c9cf`, `4316b58` and `6f8a93b`); the field now reads `done`, so
the document and the backlog table of `work-packages/README.md` agree. The
decisions of the phase are settled: ADR-0019 (configuration and accounts in the
database), ADR-0020 (WhatsApp Web as an external bridge), ADR-0021 (the
readiness over the configured channels), ADR-0022 (the ntfy access token as the
secret of the channel), ADR-0023 (the configurable stage chain), ADR-0024 (ntfy
as an optional Compose profile behind a Cloudflare Tunnel) and ADR-0025 (the
transitions as database rows) — `PLAN.md` §19 carries no open decision of the
phase. The next phase starts with its own split; a new package of phase 14
needs a new phase.

**WP-M14-74 — the tunnel token does not stop the core stack (done).** The check
run of the closing commit (v1.1.119 … v1.1.122) was red in the job
`Docker smoke test`: `docker compose` interpolates **every** service of the
file, also the ones of a profile that is not selected, so the strict
`${CLOUDFLARE_TUNNEL_TOKEN:?…}` of WP-M14-71 stopped the config of the core
stack of every deployment without a tunnel — and the smoke test of the CI —
with a message about a tunnel that was never wanted. **WP-M14-74** reads the
token as `${CLOUDFLARE_TUNNEL_TOKEN:-}`: the core stack starts unchanged while
the token is empty, and the tunnel container of the profile `tunnel` stays
stopped with the error of `cloudflared` in its log.
`scripts/ntfy-setup.sh` names the state of the key in `.env` (missing, empty or
set — never its value) before the operator starts the tunnel, `.env.example`
and `docs/DEPLOYMENT.md` describe the behaviour. The tunnel itself stays as
WP-M14-71 built it (image, command, network, `depends_on`, no host port) and the
operator command `docker compose --profile ntfy --profile tunnel up -d` stays.
The phase is closed with it.

**WP-M14-75 — the tunnel dependency is a valid compose schema (done).** The
check run of WP-M14-74 was still red in the job `Docker smoke test`:
`validating docker-compose.yml: services.cloudflared.depends_on.ntfy missing
property 'condition'` — the long syntax of `depends_on` requires the
`condition` beside the `required`, and WP-M14-71 wrote only `required: false`.
**WP-M14-75** adds `condition: service_started`: the ntfy server stays optional
(the tunnel can start on its own while only the profile `tunnel` is enabled) and
the file passes the schema of the Compose specification. The three other
compose files of the repository were valid before and stay valid. The phase is
closed with it.

**WP-M14-79 — the escalation offers and assigns tickets (out of band in phase
14, requested by the office; drafted).** The office asked for two more actions
of an escalation rule: a ticket that waits too long for a technician shall be
**offered** to a pool of technicians, and a ticket shall be **assigned** to
technicians. Until now a rule could only notify, write a webhook, write a note
or change the status (§9) — the actions were side effects. The office answered
the two questions of the design: the target is **a readiness pool or a user
group** (both are selectable), and the assignment reaches **all** technicians of
that target. **WP-M14-79** is the spec and the decision: ADR-0026 decides that
the two new action types `offer` and `assign` carry a `target`
(`{ kind, id }`), that the assignment is recorded in the new table
`ticket_assignees`, that the offer of a pool target names the on-call person in
`offered_to_user_id` and sets the offer timeout, and that the broadcast reaches
the technicians on their own ntfy topic. `specs/07-escalation.md` §7.5 gains the
two rows, the new §7.14 describes the target, the effect and the notification,
§7.12 replaces the boundary „no action changes an assignment" and
`specs/02-data-model.md` gains §4.13 for `ticket_assignees`. The children follow
in numeric order: **WP-M14-80** (the database — migration `0043` widens the
CHECK of the action types, `0044` adds `ticket_assignees`), **WP-M14-81** (the
shared contracts), **WP-M14-82** (the engine — the dispatcher performs the
`offered` and the `assigned` step of the transition table), **WP-M14-83** (the
configuration service — a target that names no pool and no group answers
`400 invalid_target`), **WP-M14-84** (the administration — the two types with
their kind and target select) and **WP-M14-85** (the ticket view names the
assignees). The numbers WP-M14-77 and WP-M14-78 belong to the announced
follow-ups of WP-M14-76 and stay untouched by this series.
**WP-M14-80 is implemented** (the database layer of the two new actions):
migration `0043_escalation_action_offer_assign.sql` drops the CHECK
`escalation_actions_type_check` and recreates it with the two new types
`offer` and `assign` — the same widening as WP-M14-40, without touching a row of
an installed database; the target of such an action lives in the `config` jsonb
(`{ target: { kind, id } }`), so no column is added. Migration
`0044_ticket_assignees.sql` adds the table `ticket_assignees` — `ticket_id` and
`user_id` as foreign keys with `ON DELETE cascade`, the primary key over
`(ticket_id, user_id)` and the index over `user_id` — the many-to-many of the
technicians a ticket is assigned to (`specs/02-data-model.md` §4.13): the
`tickets.assigned_user_id` of a single assignment keeps its meaning, and the
pool assignment of the `assign` action has no single owner.
`apps/api/src/db/schema.ts` mirrors the CHECK and the new table, the journal
reaches `0044`. WP-M14-81 … WP-M14-85 stay open in numeric order.
**WP-M14-81 is implemented** (the shared contracts of the two new actions):
`ESCALATION_ACTION_TYPES` of `packages/shared/src/schemas/escalation-config.ts`
carries `offer` and `assign` beside the four existing types, and the new union
`escalationTargetSchema` describes the target of a distribution —
`{ kind: 'pool' | 'group', id }`, a readiness pool of the on-call calendar or a
user group of the administration. Both action variants of
`escalationActionConfigSchema` carry the target next to their condition; the
jsonb of the action carries no foreign key, so the configuration service of
WP-M14-83 validates the id against `oncall_pools` and `groups`. The unit test
of `packages/shared/src/__tests__/escalation-config.test.ts` proves the two
variants and the four rejections (no kind, an unknown kind, no id, a malformed
id). WP-M14-82 … WP-M14-85 stay open in numeric order.
**WP-M14-82 is implemented** (the engine of the distribution — over the four
source-file limit of §17 it is split, the child **WP-M14-82b** carries the
responsible person and the notification): `apps/api/src/oncall/members.ts` (new)
extracts the pool members rule of `GET /api/v1/oncall/pools/:id/members`
(`specs/04-oncall.md` §4a.5) — the members of the group of a pool, otherwise
every active user holding the `oncall` role — and `apps/api/src/oncall/routes.ts`
now calls `resolvePoolMemberIds`, so the on-call route and the escalation share
one resolution. `apps/api/src/escalation/distribution.ts` (new) hands the ticket
to the technicians of a target: the `offered` or `assigned` step of
`ticket_transitions` through `transitionTicket()` (actor `system`), for an
assignment one row of `ticket_assignees` per technician, and one
`escalation_note` event `{ rule, stage, target }`. A ticket whose status has no
such step or a target without a technician changes nothing — `TicketTransitionError`
is caught and reported as `changed: false`. The dispatcher in
`apps/api/src/escalation/actions.ts` runs the two new types with the target from
the action `config` and counts `offered` and `assigned` in the scan result. The
new `apps/api/src/escalation/__tests__/distribution.integration.spec.ts` proves
the assignment (status, assignees, note), the offer to a pool, the ticket
without a step and the empty target. **WP-M14-82b is implemented** (the split
child of the engine): the `offered` step of `apps/api/src/tickets/workflow.ts`
takes `offered_to_user_id` and `offer_escalated_at` from the payload, so an
escalated offer names the on-call person of the pool (`resolveOnCallPerson`,
`specs/04-oncall.md` §4a.6) and sets the offer timeout
(`oncall.escalate_to_group_after_min`) in the transaction of the transition —
an unstaffed pool and a group target offer to the whole group without a person
and without a timeout. `apps/api/src/notifications/receivers.ts` gains
`ntfyTopicsOfUsers(database, eventType, userIds)` — the stored topic of every
user of a list who selected ntfy for the event type — and the distribution
queues one outbox row per technician with an account (`ticket.escalated` for
an offer, `ticket.assigned` for an assignment) with the technician topic in the
target; the integration spec proves the staffed offer, the unstaffed offer and
the broadcast rows. **WP-M14-83 is implemented** (the configuration service of
the two actions): `actionConfig()` in `apps/api/src/escalation/config.ts` writes
the target of an `offer` or an `assign` action into the `config` jsonb, so the
round trip through `GET /api/v1/escalation/config` keeps it; because that jsonb
carries no foreign key, the service checks the id against `oncall_pools`
(kind `pool`) and `groups` (kind `group`) and answers `400 invalid_target` with
the field paths — the rule of the `status_change` target — while a target that
was removed after the installation stays accepted (the action then changes
nothing). The config spec proves the round trip of a pool and a group target and
the two unknown targets. **WP-M14-84 is implemented** (the administration of the
two actions): the escalation page reads the readiness pools over
`GET /api/v1/oncall/pools` and the user groups over `GET /api/v1/groups` as TanStack
queries and passes them into the action editor; the editor's type select now
offers `offer` and `assign` and both render a kind select (`pool` or `group`)
and a target select over the pools or the groups of that kind — a pool or a
group without a name is not offered. `shapeOf` and `actionOf` carry the target,
and an action without a target is rejected by the shared schema, so it is never
saved. The labels `admin.escalation.action.types.offer`,
`admin.escalation.action.types.assign`, `admin.escalation.action.target`,
`admin.escalation.action.targetKind`, `admin.escalation.action.targetKinds.*`
and `admin.escalation.action.targetEmpty` exist in `de` and `en`. The page test
proves the pool offer, the group assignment with its kind select and the offer
without a target. WP-M14-85 stays open in numeric order.
**WP-M14-87 is implemented** (out of band in phase 14, requested by the office):
the office reported that the readiness calendar knows only one label — the row of
a shift in a day cell of `apps/web/src/features/oncall/readiness-calendar.tsx`
named its technician or answered `oncall.readiness.unassigned` ("nicht besetzt")
and the state and the pool of that shift stayed invisible in the `title` and in a
screen-reader span (WP-M10-41). The row now names its state label
(`oncall.admin.state.*`), its technician or `oncall.readiness.unassigned` and its
pool name in visible text beside the coloured dot; the day cell may grow
(`min-h-20`), the legend, the colour of the day and the label
`oncall.readiness.unassigned` stay, no i18n key is added and the on-call API is
untouched. The calendar test gains the case of an unstaffed `PLANNED` shift.
**WP-M14-85 is implemented** (the ticket view names the assignees): the answer
of `GET /api/v1/tickets/:ticketNo` carries `assignees` — a list of `{ id, name }`
of the rows of `ticket_assignees` (§4.13, ADR-0026; `packages/shared/src/schemas/ticket.ts`
and `apps/api/src/tickets/detail.ts`), name only, no contact value. The ticket
view in `apps/web/src/features/tickets/ticket-detail-page.tsx` shows the
technicians below the status under the label `detail.assignees.title`
(`Zuweisen` in `de`, `assigned technicians` in `en`) — a ticket without
assignees shows nothing. **WP-M14-85b is implemented** as well:
`apps/web/src/features/tickets/__tests__/ticket-detail-assignees.test.tsx`
renders the ticket detail page with a mocked answer that carries two assignees
and proves that the view names both technicians, that a ticket without
assignees shows no row and that no contact value appears — the feature of the
office is closed.

**Record correction (WP-M14-79).** Commit `6820920` implemented the spec and
decision package of the offer and assign actions — `specs/07-escalation.md`
§7.5 and the new §7.14, `specs/02-data-model.md` §4.13, ADR-0026 with its index
row and the children WP-M14-80 … WP-M14-85 in the same commit — but the
document still carried `status: planned` and the backlog table still listed
that row as `planned`. Both now read `done`, so the record matches the shipped
chain WP-M14-80 … WP-M14-85b; the office items WP-M14-76 … WP-M14-87 of the
phase are out-of-band entries whose feature is closed with WP-M14-85b, WP-M14-86
and WP-M14-87. No product code, schema, route, UI, specification or ADR changes.

**The internal notification inbox (WP-M14-120, out of band in phase 14).** The
office asked for an overview of the own notifications: until now a user saw
only whether a channel failed as a whole, never which message went to which
channel and whether it arrived. The inbox is the internal layer between the
application and the external channels — ntfy, Telegram, Matrix, Signal, e-mail,
WhatsApp Web and Web Push stay the transports, but every notification that is
enqueued for a **user** is recorded first and the record carries the state of
that delivery. The work is split into five children that run in numeric order:
**WP-M14-120a** (the database and the contracts — the migration
`0047_notification_messages.sql` with the table `notification_messages` and the
column `outbox.notification_message_id`, its journal entry, the Drizzle mirror
and the shared contracts), **WP-M14-120b** (the delivery layer — every enqueue
path of a personal delivery writes the message row next to the outbox row and
the drain flips its state), **WP-M14-120c** (the API — the own messages and the
read receipt behind the session), **WP-M14-120d** (the inbox page
`/notifications`) and **WP-M14-120e** (the bell in the shell with the number of
the unread messages). All five are implemented. The migration is registered in
the journal of the migrations folder — the Drizzle migrator reads the journal
and applies only the migrations it names, so a migration file without a journal
entry never reaches a database; that was the reason why the table was missing
in the test databases of the suites that write a personal delivery. The event
type `ticket.resolved` of §11.4 still has no delivery path — a gap that the
later work on the event types closes, together with **WP-M14-121** (the test of
the own topic calls the administration route today and therefore needs the
permission `notification.write`).

**The ntfy guide names the topic-prefix ACL (WP-M14-123, out of band in phase
14).** An access-controlled ntfy server that was configured by hand granted the
token user only the single topic `stoerdesk`: the test message of the channel
card arrived, but every ticket notification ended `http_403`, because the
personal topics are generated as `stoerdesk-<random>`. `docs/DEPLOYMENT.md`,
`README.md` and `.env.example` now name the required ACL — the token user
read-write and the recipient (`everyone` or a dedicated user) read-only on
`stoerdesk-*` — and both symptoms: a missing write entry fails the delivery, a
missing read entry lets the delivery succeed while the recipient's personal
link answers `403`. No product code, route, schema or UI changes.

**The web-push subscription endpoint stores the browser of a user (WP-M14-124,
out of band in phase 14).** `push_subscriptions` existed since migration `0019`,
but no route wrote it, so the adapter always saw an empty list. The three
session-guarded routes under `/api/v1/notifications/accounts/webpush` now answer
the VAPID public key and the device count of the signed-in user (`GET`), store
`{ endpoint, keys }` (`POST`) and remove one endpoint idempotently (`DELETE`).
The endpoint is the device identity: a repeated subscription replaces the old
row and a second user on a shared device takes it over, so the drain never sends
the same notification twice to one browser. No migration was needed. The service
worker and the settings UI follow in **WP-M14-125**.

**The service worker shows the web-push message (WP-M14-125, out of band in
phase 14).** The adapter sends a text payload, but the injectManifest service
worker had no `push` or `notificationclick` listener. A `push` event now shows a
notification from the first line (title), the rest (body) and the optional last
block `<label>: <url>` (deep link); a click closes it and focuses an open app
window or opens the link. The label is the translated
`notification.action_label` of the server, so the parser never hard-codes a
locale. The subscribe card follows in **WP-M14-126a** and **WP-M14-126b**.

**The settings page registers this browser for web push (WP-M14-126a/126b, out
of band in phase 14).** The card on `/settings/notifications` reads the VAPID
public key, asks for the notification permission on click, subscribes with
`pushManager` and stores the device through the route of WP-M14-124; the remove
button drops the local subscription and the server row. A missing key, a browser
without PushManager (an iPhone outside the installed app) and a refused
permission each name their own hint instead of offering a button that cannot
work. The overview and the selection read the same `['webpush-config']` query,
and a QR opens the page on the phone. With WP-M14-124 and WP-M14-125 the web-push
channel is usable end to end.

**The own ntfy topic test gets a route of the own user (WP-M14-121, out of band in
phase 14).** The test button of the own topic on `/settings/notifications` called
the administration route `POST /v1/admin/channels/ntfy/test`, which needs
`notification.write` — a user without that permission got `403` and could never
test the own subscription. `POST /api/v1/notifications/accounts/ntfy/test` now
sits behind the session alone: the target is the **stored** topic of the session
user, never a topic of the request body (a client-supplied target would publish to
the topic of another user), a user without an ntfy account answers
`delivered: false` with `account_not_linked` and sends nothing, and a failing
adapter stays the regular answer with its machine code. The settings page calls
the new route. `WP-M14-118` and `WP-M14-119` were already implemented, their
`status:` lines still read `planned` — both are set to `done`. The inbox still
does not name the web-push setup page — that is **WP-M14-128**, the next open
item of the phase.

**One click on the bell opens the inbox page (WP-M14-127, out of band in phase
14).** The office asked for the page itself: the bell of the header is one link
to `/notifications`, the dropdown panel of WP-M14-122 with its message query,
its mark-read mutation and its close-on-escape rule is gone. The unread badge of
WP-M14-120e and its refetch on window focus stay, and marking a message as read
belongs to the inbox page of WP-M14-120d. The setup link of the inbox page
follows in **WP-M14-128**; WP-M14-121 is closed by the package above, so the open
item of the phase is **WP-M14-128**.

**The inbox names the setup page of the web push (WP-M14-128, out of band in phase
14).** The office asked for the way to the registration: web push exists end to
end (WP-M14-124 … WP-M14-126b), but a user who never registered this browser saw
no way to it. The inbox page reads `GET /api/v1/notifications/accounts/webpush`
under the shared `['webpush-config']` query key — react-query dedupes it with the
card of WP-M14-126a, so no second request leaves the browser — and shows one hint
line with the link to `/settings/notifications` while the channel carries no VAPID
key or no device of the user. A pending or failed query shows no hint and no
error: the inbox never blocks on the state of the channel. The texts are
`inbox.webpush.hint` and `inbox.webpush.setup` (de/en); the subscribe action
stays the settings page of WP-M14-126a.

**The daily check warns over another channel (WP-M14-130c, out of band in phase
14).** A broken channel warns the administration once a day over another
channel: the daily check (the pg-boss queue `notification-health`, 04:00 server
time) reads the rows of the outbox and names the channels that are broken —
their last delivery failed and no delivery of them succeeded since. For every
broken channel it writes one row of the event type `channel.health_warning` for
the first configured channel of the chain that is not the broken one. The warning
never goes to the broken channel and never falls back further: the warning is
the last word about the channel. At most one warning per broken channel and per
day; a channel that works again is silent. The text names the broken channel and
the machine code of its last failure, is translated (de/en) and carries no
emergency number (`PLAN.md` §2).

**The outbox learns the instance row of the warning (WP-M14-130b, out of band in
phase 14).** A warning of a broken channel belongs to no ticket and to no
shift: it announces the state of a channel. Migration
`0049_channel_health_warning.sql` adds the eighth type
`channel.health_warning` to the check of the event type of the `outbox` table
and widens the check of a ticket and a shift — a row of the warning type may
carry neither, every other row keeps its rule of exactly one of the two. The
seven event types a user selects channels for (§11.4) stay unchanged: the
warning is never a selection of a user.

**The dead subscription of the web push is named and removed (WP-M14-130a, out of
band in phase 14).** The web push has no status query: the only signal is the
answer of the push service to a real send. A `404` or a `410` means that the
endpoint no longer exists — the browser revoked the permission, the browser was
reinstalled or the subscription expired. The adapter names such an endpoint as
**dead**, the send continues with the next device, and the channel removes the
row of `push_subscriptions` after a send that reached a live device. Only when
**every** device of a send is dead the send fails with the code
`push_subscription_dead`: the row of the outbox carries that code as its
`lastError` (§11.8), the administration names the failure and the chain of
§11.1 falls back to the next channel. A send where every device is dead keeps the
rows — the retry of the drain probes them again. The endpoints are capability
urls and never enter a log line (§11.13).

**The health of the notification channels (WP-M14-130, out of band in phase 14).**
The office asked two questions about the web push: can the channel be checked
every day, and can a message over another channel announce that the
notification function is broken. The web push has no status query — the only
signal is the answer of the push service to a real send, so **ADR-0028** decides:
the check is **passive** (a `404` or `410` of the push service names a dead
subscription and the next successful send removes its row), the **daily check**
reads the rows of the outbox and names the channels that are broken (their last
delivery failed and no delivery of them succeeded since), and a broken channel
warns **once a day over another channel** — the first configured channel of the
chain that is not the broken one, never with a fallback of its own. The warning
is an instance row of the event type `channel.health_warning`: it belongs to no
ticket and to no shift, so the checks of the `outbox` table learn that shape
(migration `0049`). The text names the channel and the machine code of its last
failure, is translated (de/en) and carries no emergency number (`PLAN.md` §2).
The package writes no product code: the chain is split into **WP-M14-130a** (the
dead subscription), **WP-M14-130b** (the instance row) and **WP-M14-130c** (the
daily check and the warning); the three documents exist and run in numeric order.

**The ticket number drops the year (WP-M14-129, out of band in phase 14).** The
office pointed out what the visible number leaks: the customer sees it on the
confirmation page (§7.3.2) and on the public status page (§7.3.4), so
`ST-<year>-<counter>` over a per-year row of `ticket_no_counters` lets a customer
count the malfunctions of a year and the reports between two of their own reports.
**ADR-0027** decides the answer: one global counter row (`ticket_no_counter`,
single row `global`), the format `ST-` plus the counter padded to four digits
(`ST-0001`), no calendar year, existing numbers untouched and still accepted by
`ticketNoSchema` — the legacy shape and the new one, so an old bookmark, an old
status page and a queued `ticket_no` of a client outbox resolve unchanged. The
package writes no product code: the chain is split into **WP-M14-129a** (the
counter, the contract and the assertions — one coupled slice, because the
migration alone writes a number the old contract rejects),
**WP-M14-129b** (a number of the yearly counter still resolves through the API)
and **WP-M14-129c** (a malformed number is still rejected at every entry point);
the three documents exist and run in numeric order. The open items of the phase
are **WP-M14-129a** … **WP-M14-129c**.

**The counter of the ticket number becomes one global row (WP-M14-129a, out of
band in phase 14).** Migration `0048_ticket_no_counter_global.sql` replaces the
yearly `ticket_no_counters` of migration `0004` with `ticket_no_counter` — one
row, the key `global` — and redefines `next_ticket_no()`: it allocates through
the same `INSERT … ON CONFLICT DO UPDATE … RETURNING`, but returns `ST-` plus
the counter padded to four digits, without a calendar year. The new row is
seeded with the highest `next_value` the yearly rows ever held, so a new number
never counts below an old one; the yearly rows are dropped, and every allocated
number stays untouched and readable. The Drizzle mirror follows the table
(`ticketNoCounter`, `TicketNoCounter`), the shared contract `ticketNoSchema`
knows both shapes — the year-free `ST-0001` and the legacy `ST-2026-0001` — and
the ticket tables integration spec expects `ST-NNNN` and proves that a number of
the yearly counter is still readable. The proof through the API and the guard
against a malformed number follow in **WP-M14-129b** and **WP-M14-129c**.

**A number of the yearly counter still resolves through the API (WP-M14-129b,
out of band in phase 14).** ADR-0027 decision 4 and 5 keep the old numbers
alive: a number of the yearly counter (`ST-2026-0001`) is never rewritten, so a
bookmark, a printed link and the outbox of a client carry it. The new
integration spec writes such a ticket and proves that the detail route, the
comment route of the internal user, the review step of the workflow and the
public status page answer it unchanged — the guard of WP-M9-29 knows both
shapes since WP-M14-129a. The guard against a malformed number follows in
**WP-M14-129c**.

**A malformed number is still rejected at every entry point (WP-M14-129c, out of
band in phase 14).** The widening of `ticketNoSchema` in WP-M14-129a must not
weaken the format guard of SEC-015: the new integration spec sends a malformed
number (`st-0001`, `ST-1`, `ST-2026-26-1`, a percent-encoded path traversal and
an injection attempt) to the detail route, the comment route of the internal
user, the review step of the workflow, the external work-order route and the
delete route — each answers `400 invalid_request` with `fields: ['ticketNo']`
and never reaches the database, while the year-free `ST-0001` passes the guard
and reaches the lookup. With WP-M14-129a … WP-M14-129c the year-free ticket
number is closed.

**The names of the readiness belong to a role (WP-M14-131/132, out of band in
phase 14).** The office asked that the names of the technicians in the
readiness calendar are visible to the admins and to nobody else — or to a role
the administration switches on. The calendar itself is read with `oncall.read`
(`specs/04-oncall.md` §4a.2), so every role that reads the plan of the
readiness also saw who has it. The names are now a right of their own: the
permission key `oncall.read_names` in the catalog of
`packages/shared/src/permissions.ts`, held by the `admin` role and by every
custom role the administration grants it to over the role API
(`specs/01-rbac.md` §3.3, §3.8). **WP-M14-131** writes the key and the
specification, **WP-M14-132** the gate in the web app: a role without the key
reads the same calendar — the state, the colour and the pool of every shift —
but the row of a shift answers "besetzt" instead of the name, and the browser
does not ask for the members of the pool at all. The API keeps answering the
names to `oncall.read` (the members of a pool are the candidates of a swap);
the gate is in the web app, as the rule of `specs/01-rbac.md` §3.7 says. Both
packages are implemented.

**The roles page edits one role at a time (WP-M14-133, out of band in phase 14).**
The office reported that the permission checkboxes of the role management do not
belong to the selected role: a role can be selected, the checkboxes can be changed
and the page saves — but the grants of the role before stay and are written to the
role that is open now, so the permissions look like they belong to every role. The
API was never wrong — `PATCH /api/v1/roles/:key` replaces the `role_permissions`
of that one role (`specs/01-rbac.md` §3.8) — the editor of the web app kept the
state of the role before, because React reuses the same component instance when the
prop `role` changes. The page keeps the key of the selected role, derives the role
from the answer of the query and mounts the editor with the key of the role: a new
role mounts a new editor with its own state, so the grants of a role never leak
into another one. The seed stays the authority for the five system roles
(`specs/01-rbac.md` §3.5) — their grants are rewritten on the next seed run, a
custom role keeps them.

**The priority of the object deviates from the standard (WP-M14-134, out of band
in phase 14).** The office asked for the priority per object and for the
standard values in the administration: „wir machen einen parallelen tabelle in
der nur die abweichungen vom standard mit der objektnummer verknüpft wird".
Today the priority is only a field of the request — an internal report chooses
it, a QR report always starts as `normal` — and the standard priority is
hard-coded. **ADR-0029** decides: the standard is the setting
`ticket.default_priority` (default `normal`), the deviations live in the
parallel table `object_priority_overrides` (migration `0050`) and hold only
what differs from the standard — a value that equals the standard removes the
row, and changing the standard deletes the rows that no longer deviate. The
effective priority of an object is its deviation, else the standard; the object
summary carries the effective priority and the stored deviation
(`specs/02-data-model.md` §4.3.2, `specs/08-objects-api.md` §9.1). A new ticket
takes the deviation: the internal form preselects it, the QR report has no
other choice, the explicit choice of the internal user still wins
(`specs/06-report-form.md` §7.2). The package writes no product code: the chain
is split into **WP-M14-134a** (the table), **WP-M14-134b** (the contracts),
**WP-M14-134c** (the service), **WP-M14-134d** (the routes), **WP-M14-134e**
(the ticket), **WP-M14-134f** (the object form), **WP-M14-134g** (the
administration page), **WP-M14-134h** (the route and the menu entry) and
**WP-M14-134i** (the create form).

**The table of the priority deviations (WP-M14-134a, out of band in phase 14).**
Migration `0050_object_priority_overrides.sql` adds the table
`object_priority_overrides` (`specs/02-data-model.md` §4.3.2, ADR-0029): the
`object_id` is the primary key and points at the uuid of the object with
`ON DELETE CASCADE`, `priority` carries the check over the four priorities, and
the timestamps are the ones of §4.2. The table holds only the deviations from
the standard — a row that equals the standard is not stored. The object number
stays the key of the object list outside the database.

**The contracts of the priority and of the standard (WP-M14-134b, out of band in
phase 14).** The shared package learns the schema of the priority
(`ticketPrioritySchema` over the four values), the standard of the instance
(`ticketDefaultsSchema` — the same shape is the body of the `PUT` and the
answer of the `GET`) and one deviation of an object
(`objectPriorityOverrideSchema`, `objectPriorityOverrideListSchema` — the uuid
of the object, its number, its name and its priority). The contracts carry no
consumer yet: the object summary and the object write learn the priority in
WP-M14-134c, the routes answer them in WP-M14-134d.

**The service reads and writes the deviation (WP-M14-134c, out of band in phase
14).** The new module `apps/api/src/objects/priority.ts` knows the standard (the
setting `ticket.default_priority`, `normal` without a row), the stored
deviations of the table and the pruning of the rows that no longer deviate. The
object summary carries the effective priority and the stored deviation, the
object write accepts the field `priority` — `null` removes the deviation, a
value that equals the standard removes it as well. The external API sets no
deviation: the priority is a decision of the office.

**The routes answer the standard and the deviations (WP-M14-134d, out of band in
phase 14).** `GET/PUT /api/v1/settings/ticket-defaults` reads and replaces the
standard priority (`settings.read`/`settings.write`),
`GET /api/v1/settings/ticket-defaults/overrides` lists the objects whose
priority differs from it. The `PUT` stores the standard and deletes the
deviations that no longer deviate from it — the table holds only what differs
from the standard.

**The ticket takes the priority of the object (WP-M14-134e, out of band in phase
14).** The priority of a new ticket is the deviation of its object, else the
standard. The internal report keeps the explicit choice of the user — the form
preselects the priority of the object, so the deviation applies unless the user
chooses another one; a request without a priority takes the deviation. The QR
report has no choice at all: the deviation of the object wins, else the
standard. The external API keeps the priority of the request. The deadline of
the ticket follows the priority.

**The object form carries the priority (WP-M14-134f, out of band in phase 14).**
The create and the edit form of the object carry the field "Priorität" with the
option "Standard" and the four priorities; the edit form shows the stored
deviation, so an object that follows the standard shows "Standard". The package
also repairs the form: the state started empty, because the query answers after
the first render — the office saw an empty form and the save wrote the empty
fields over the object. The fields are filled when the answer arrives.

**The administration shows the standard and the deviations (WP-M14-134g, out of
band in phase 14).** The new page of the administration shows the standard
priority of the instance and the list of the objects whose priority differs from
it. The standard is written with one request; the write also deletes the
deviations that no longer deviate. Without the permission to write the settings
the select stays read-only.

**The route and the menu entry of the defaults (WP-M14-134h, out of band in
phase 14).** The route `/admin/defaults` opens the page of the standard values,
and the menu of the administration carries the entry "Standardwerte" next to
the escalation.

**The create form starts from the priority of the object (WP-M14-134i, out of
band in phase 14).** Picking an object in the internal report takes the
effective priority of that object into the select of the priority: the deviation
applies unless the user chooses another one.

**The admin sees which message arrived at which user (WP-M14-141, out of band
in phase 14).** The office asked for two things: the notification shall react
to the own messages only, and under `/notifications` a filter shall show an
admin which messages arrived at which users — with a permission of its own
that a role can be given. The inbox of a user stays personal: the page and the
bell show and count only the own messages. The second view is a right of its
own: the permission key `notification.read_all` in the catalog of
`packages/shared/src/permissions.ts` — it belongs to no default role, the
administration assigns it to a role over the role API
(`specs/01-rbac.md` §3.8), `admin` holds it through the catalog. The gate is in
the API (`specs/10-notifications.md` §11.16): without the key the answer of
`GET /api/v1/notifications/messages` holds the own messages, the addressee of a
row is `null` and a request for the messages of another user answers
`403 forbidden`. With the key the route reads the filters of the addressee, the
channel, the event, the state of the delivery and the unread messages, and the
answer names the addressee of every row. The package writes no product code:
the chain is split into **WP-M14-141a** (the key and the contracts),
**WP-M14-141b** (the API) and **WP-M14-141c** (the page).

**The permission key and the contracts of the filter (WP-M14-141a, out of band
in phase 14).** The catalogue of `packages/shared/src/permissions.ts` gains the
key `notification.read_all` — it belongs to no default role, `admin` holds it
through the catalogue, the administration assigns it to a role over the role API
(`specs/01-rbac.md` §3.8). The shared package learns the filter of the message
list (`notificationMessageFilterSchema` — the addressee, the channel, the event,
the state of the delivery and the unread messages), the addressee of a row
(`notificationMessageRecipientSchema`) and the list of the addressees with the
number of their messages (`notificationRecipientSummarySchema`). The answer of
the inbox carries the two new fields; without the permission they stay empty.
The seed writes the new key into the table `permissions` on the next start —
no migration.

**The API of the filtered inbox (WP-M14-141b, out of band in phase 14).**
The new module `apps/api/src/notifications/messages.ts` reads the messages of
the filter and the addressees with the number of their messages. The route
`GET /api/v1/notifications/messages` reads the filters of the addressee, the
channel, the event, the state of the delivery and the unread messages: without
the permission `notification.read_all` the answer holds the own messages, the
addressee of a row is `null` and the list of the addressees is empty, and the
addressee of another user answers `403 forbidden`. An unknown value of a filter
answers `400 invalid_request` with the field path. The read receipt and the
unread count stay bound to the session user.

**The filter under `/notifications` (WP-M14-141c, out of band in phase 14).**
The page of the inbox reads the permission with `usePermission`: without
`notification.read_all` the page stays exactly as it is — the own messages,
the limit and the read receipt. With the permission the page adds the filter of
§11.16 above the list: the addressee (the list of the addressees of the answer
with the number of their messages), the channel, the event, the state of the
delivery and the checkbox for the unread messages. The values live in the query
of the URL, so a filtered view can be shared. Every row names its addressee,
and the read receipt stays a right of the own messages: a row of another user
is not clickable.

**The browser answers for its own push subscription (WP-M14-142, out of band in
phase 14).** The office complained about the push: „unter notifikation wird
einfach per text was behauptet! … das wird ja nichtmal geprüft!“ The web-push
UI claimed a state of the browser that nobody had asked: the card of
`/settings/notifications` named a device as registered after one local
subscription, and the inbox of `/notifications` named the browser as not
enabled from the device count of the account — both are wrong whenever the
browser and the server disagree, and the browser was never asked at all. The new
module `apps/web/src/lib/web-push.ts` holds one probe that asks **this**
browser for its own push subscription and names the state it found:
`unsupported` (no `PushManager`, no service worker), `denied` (the
notifications of the site are blocked), `subscribed`, `not_subscribed` and
`unknown` (the browser did not answer — nothing is claimed then). The card and
the inbox read this one probe, so both name the same cause
(`specs/10-notifications.md` §11.12). The chain continues with **WP-M14-143**
(the inbox asks this browser), **WP-M14-144** (the server answers whether it
holds the device of this browser), **WP-M14-145** (the card asks the server
about this device) and **WP-M14-146** (the inbox asks the server about this
device).

**The inbox asks this browser (WP-M14-143, out of band in phase 14).** The hint
of the web push under `/notifications` claimed „Push notifications are not
enabled in this browser yet.“ from the device count of the account — a
statement about the browser that was never asked, and a wrong one while
another device of the account is registered. The page reads the state of the
browser from the probe of WP-M14-142 and the state of the server from the
configuration of the channel, and names the cause it found: a browser without a
push manager, a blocked permission, a browser without a subscription and a
server without a VAPID key get four different texts; the missing server
configuration is named without a link, because the user cannot fix that. The
page stays silent while a question is open — nothing is claimed without a
check. The German texts replace the English sentence of WP-M14-128.

**The server answers whether it holds the device of this browser (WP-M14-144,
out of band in phase 14).** The browser knows its own subscription, the server
knows its rows — only both together say whether a push can arrive. The new
route `POST /api/v1/notifications/accounts/webpush/check` answers the question
for the signed-in user: `hasWebPushSubscription` reads the row of the user and
the endpoint, and the answer carries a boolean only. The endpoint is a
capability URL, so it travels in the body of the request and never in an
answer and never into a log line (`specs/10-notifications.md` §11.3). The chain
continues with **WP-M14-145** (the card asks the server about this device) and
**WP-M14-146** (the inbox asks the server about this device).

**The card asks the server about this device (WP-M14-145, out of band in phase
14).** „Dieses Gerät ist angemeldet.“ was the answer of the card as soon as the
browser held a subscription — even when the server had no row for it and no
push message could ever arrive. The card asks the server about the endpoint of
this browser (`POST /api/v1/notifications/accounts/webpush/check`) and names the
device as registered only while the server confirms it; a device the browser
holds and the server does not know gets its own line and the register action —
the button registers the existing subscription again, without a second
permission prompt. While the server has not answered the card claims nothing.

**The inbox asks the server about this device (WP-M14-146, out of band in phase
14).** A browser whose device the server does not know receives no push
message, and the inbox of WP-M14-143 stayed silent because the browser itself
holds a subscription. The page asks the server about the endpoint of this
browser (`POST /api/v1/notifications/accounts/webpush/check`) and names that
case with its own text (`inbox.webpush.notRegistered`) and the link to the setup
page, where the card of WP-M14-145 registers the device again. With that the
chain of the push is closed: the browser says what it has, the server says what
it knows, and both pages name the same cause.




**The readiness shift is a condition of the escalation (WP-M14-147, out of band
in phase 14).** „zu den bedingungen bei den escalationsstufen muss die Schicht
wählbar sein also Bereitschafts-Schicht und dann den schicht-pool auswählen …
es geht darum dass die techniker der schicht nur dann eine nachricht bekommen
sollen, wenn sie auch schicht haben". ADR-0030 decides: the conditions gain the
field `shift` — its value is the uuid of a readiness pool, and it matches when
the pool has a staffed shift at the moment of the evaluation (a `CONFIRMED`, a
`SWAP_REQUESTED` or a `PLANNED` shift that covers now, the rule of
`specs/04-oncall.md` §4a.6). A `notify` action with a readiness pool as its
target reaches the technicians who have a shift in that pool and not the
members of the pool without a shift. The evaluation stays a pure function: the
facts of a ticket carry the staffed pools, and the scan reads them once per
minute, not once per ticket. The chain is split into **WP-M14-147a** (the shared
contract), **WP-M14-147b** (the engine), **WP-M14-147c** (the configuration
service) and **WP-M14-147d** (the administration).

**The condition of the readiness shift in the shared contract (WP-M14-147a).**
The leaves of §7.4 gain the field `shift` — the operators `eq` and `ne`, the
value the uuid of a readiness pool. The facts of a ticket gain the optional
fact `staffedPools`: the ids of the pools with a staffed shift at the moment of
the evaluation. The evaluator matches a pool of that list; without the fact the
leaf never matches, so a rule that asks for a staffed pool never fires because
nobody answered. The evaluation stays a pure function — the API collects the
fact (WP-M14-147b).

**The engine reads the readiness (WP-M14-147b).** `apps/api/src/oncall/coupling.ts`
answers the readiness of a moment: `resolveStaffedPoolIds` returns the pools
with a staffed shift — a `CONFIRMED`, a `SWAP_REQUESTED` or a `PLANNED` shift
that covers the moment and has a technician — and `resolveOnDutyUserIds` the
technicians with a shift in one pool. The scan of the escalation reads the
staffed pools once per minute and hands them to the facts of every ticket, so
the condition `shift` of a rule can ask for the readiness service. A `notify`
action with a readiness pool as its target reaches the technicians with a shift
in that pool — the members of the pool without a shift receive nothing
(ADR-0030). The `offer` and the `assign` action keep their meaning: they
distribute the ticket to the whole team of the target (§7.14).

**The configuration service checks the pool of the condition (WP-M14-147c).**
The jsonb of a condition carries no foreign key, so `PUT
/api/v1/escalation/config` walks the conditions of the rules and of their
actions and checks every leaf of the field `shift` against the rows of
`oncall_pools` — a pool that does not exist answers `400 invalid_target` with
the field path of the condition, the rule of the target of an action (§7.5).
The check reuses the pool rows the service already reads for the targets, so a
configuration costs no second query.

**The administration offers the pool in the condition (WP-M14-147d).** The
builder of a condition offers the readiness pools for the field `shift` — the
name of the pool is what the office reads, and the value is its uuid. The page
reads the pools already for the targets of an `offer` and an `assign` action
and hands them to the builder of the rule and to the builder of the action, so
no second request leaves the browser. The builder writes the typed value of a
leaf through `conditionValue`: a single value for `eq` and `ne`, a list for
`in` and `notIn`. The select of a single field kept its value as a list
before, and the contract of a leaf like `shift` (a uuid) or `assigned` (a
boolean) refuses a list — such a condition could not be saved at all.




**The administration sets a new password for a colleague (WP-M14-148, out of band
in phase 14).** „bei der benutzerverwaltung fehlt eine funktion .. neues
passwort festlegen .. dabei soll ein zufallspasswort erzeugt werden welches ein
einmalpasswort ist das in die zwischenablage kopiert wird sodass man es dem
kollegen geben kann .. bei der anmeldung mit dem neuen passwort muss der kollege
aber ein neues, eigenes, geheimes eingeben". ADR-0031 decides: the server
generates the password (`POST /api/v1/users/:id/password`, `user.write`), the
plaintext is answered exactly once (`{ temporaryPassword }`) and the account
carries the flag `users.must_change_password` — while the flag is set, every
guarded route answers `403 { code: 'password_change_required' }` and the
colleague sets a password of his own through `PATCH /api/v1/users/me`. The
sessions of the account die with the secret. The chain is split into
**WP-M14-148a** (the column), **WP-M14-148b** (the contracts), **WP-M14-148c**
(the session and the guard), **WP-M14-148d** (the route of the administration),
**WP-M14-148e** (the form of the colleague) and **WP-M14-148f** (the panel of the
administration).

**The column of the open password change (WP-M14-148a, out of band in phase
14).** The table `users` gains the flag `must_change_password` — boolean, not
null, default `false` (migration `0051_users_must_change_password.sql`). The
flag marks an account whose password is a one-time password; the migration
touches no row, because an installed account holds a password of its own. The
contracts of the flag follow in WP-M14-148b.

**The contracts of the open password change (WP-M14-148b, out of band in phase
14).** The answer of the login and of `GET /api/v1/me` and the row of the user
list carry the flag `mustChangePassword` (default `false`, so a caller that does
not know the flag stays valid), and the answer of the reset carries the
plaintext of the one-time password as `temporaryPassword`. The session that
reads the flag and the guard that blocks the account follow in WP-M14-148c.

**The session knows the open password change (WP-M14-148c, out of band in phase
14).** The session reads the flag of the one-time password per request, so a
reset takes effect without a new login. While the flag is set, every guarded
route answers `403 { code: 'password_change_required' }` — the account may log
in, but it may not work before the user sets a password of their own. `GET
/api/v1/me` and `PATCH /api/v1/users/me` stay reachable; the own password clears
the flag and ends the sessions of the other devices. The route of the
administration follows in WP-M14-148d.

**The administration sets the one-time password (WP-M14-148d, out of band in
phase 14).** The route `POST /api/v1/users/:id/password` (`user.write`) lets the
administration set the password of a colleague: the server generates it — 20
characters out of an alphabet without the ambiguous `O`, `0`, `I`, `l` and `1` —
and answers the plaintext exactly once (`{ temporaryPassword }`). The account
carries the flag of the open password change, and the sessions of the account die
with the secret. The log line of the reset carries the code only. The form of the
colleague follows in WP-M14-148e.

**The colleague sets his own password (WP-M14-148e, out of band in phase 14).**
An account whose password is a one-time password sees the form of the own
password instead of the app: the gate of the app reads the flag of the answer of
the login and of `GET /api/v1/me` and renders the form while the flag is set.
The repetition must match the first field in the browser; the server knows only
the one password. The panel of the administration follows in WP-M14-148f.

**The administration hands the one-time password over (WP-M14-148f, out of band
in phase 14).** The user management gains the action „Neues Passwort“: it asks
before it replaces the password of a colleague, and the answer opens the panel
with the one-time password and a button that copies it into the clipboard. The
password is shown once, because the server answers it once. The list names the
colleagues who still hold a one-time password. The chain of the one-time
password is closed.

**The internal comment never leaves the office (WP-M14-149, out of band in
phase 14).** The comment function of the ticket view gains a second kind of
comment: the internal comment. It never reaches the customer — neither in the
printout nor in the e-mail of the prepared send view. It has its own
permission key, which the administration grants to the colleagues who may write
it, and it is recognisable at a glance by a dark red background whose colour
the administration configures under „Darstellung“.

ADR-0034 decides the shape: the internal comment is its own event type of the
trail (`internal_comment` — the type column of `ticket_events` carries no check
constraint, so no migration is needed), the key `ticket.comment.internal`
belongs to no default role and the administration grants it to a role or to a
colleague (the rule of `notification.read_all`), the guarantee „never printed,
never sent" is a rule of the prepared send view and of the event type, the
colour is a hex value of the instance under „Darstellung“ (the default is a
dark red) and the write stays offline-capable — an internal comment is never
queued as a normal comment, because a normal comment is printed. The chain is
split into **WP-M14-149a** (the key), **WP-M14-149b** (the API),
**WP-M14-149c** (the prepared send view), **WP-M14-149d** (the settings),
**WP-M14-149e** (the page of the Darstellung), **WP-M14-149f** (the offline
queue) and **WP-M14-149g** (the ticket view). Every child is implemented
(v1.1.251, v1.1.254 … v1.1.262), the chain of the internal comment is closed.

**The ticket view writes and shows the internal comment (WP-M14-149g, out of
band in phase 14).** The composer of the ticket view gains the checkbox of the
internal comment — only with the key `ticket.comment.internal`. The checkbox
changes the write: the note goes to the route of the internal comment, the
normal comment keeps its route, and a note that fails without a connection is
queued as a note, never as a normal comment. The field and the entry of the note
in the history carry the colour of the instance, and the text colour follows
the brightness of the background, so the note is recognisable at a glance and
stays readable for every colour the administration picks. The confirmation
dialog names the rule: the note is neither printed nor sent to the customer.
The chain of the internal comment is closed.

**The offline queue carries the internal comment (WP-M14-149f, out of band
in phase 14).** The internal comment joins the three internal writes of the
outbox: the queue carries the kind `internal_comment`, the replay posts it to
its own route, and the hook of the queue knows the kind. The note is never
queued as a normal comment — a normal comment is printed with the prepared send
view. The predicate of the service worker matches the route of the internal
comment as well, so the note shows up in the history at once.

**The colour of the internal comment under „Darstellung“ (WP-M14-149e, out
of band in phase 14).** The page of the Darstellung gains the field of the
colour — a text field with the hex value and a swatch that shows it. The save
sends it with the company name, the title switch and the logo, so one save
writes the whole row. A colour that is no hex value never leaves the browser:
the page names the mistake and sends nothing.

**The settings know the colour of the internal comment (WP-M14-149d, out of
band in phase 14).** The colour of the internal comment is a value of the
instance: the row of the branding carries it, and the administration sets it
under „Darstellung“ (WP-M14-149e). The new route `GET /api/v1/settings/display`
answers the colour for the ticket view. It sits behind `ticket.read` and not
behind `settings.read`: a colour is no secret, and every colleague who may
read a ticket may read the colour of the presentation. A row without the field
answers the default of the server — a dark red — and a value that is no hex
colour answers the default as well.

**The prepared send view leaves the internal comments out (WP-M14-149c, out
of band in phase 14).** The prepared send view is the printout of the ticket
and the source of the HTML that goes into the e-mail program of the customer —
its history leaves the internal comments out, so the note of the colleagues is
neither printed nor copied into the e-mail. The filter uses the predicate of the
shared contract, so one list names the event types that never reach the
customer.

**The API writes the internal comment (WP-M14-149b, out of band in phase
14).** The route `POST /api/v1/tickets/:ticketNo/comments/internal` sits behind
the key `ticket.comment.internal` — a route of its own, because
`requirePermission` has OR semantics and a flag in the body would let every
colleague with `ticket.comment` write the note. The body is the body of the
comment route, the answer is the answer of the comment route, and the write runs
through `applyInternalAction`, so the receipt of the idempotency key works as it
does for the other internal writes. The event of the trail carries the type
`internal_comment`, the payload of the comment and the actor of the session.
The shared contract names the event types that never reach the customer, so the
prepared send view has one list to filter with.

**The catalogue knows the key of the internal comment (WP-M14-149a, out of
band in phase 14).** The catalogue of `packages/shared/src/permissions.ts`
gains the key `ticket.comment.internal` — the right to write the internal
comment, the note of the colleagues that never reaches the customer. The key
belongs to no default role: the administration grants it to a role or to a
colleague, `admin` holds it through the catalogue (the rule of
`notification.read_all`). The seed writes the key into the table `permissions`
with the next start, so no migration is needed.


**The assignment names a technician and the notification reaches him (WP-M14-150,
out of band in phase 14).** The office asked for two changes in the escalation
of the administration: the action „Ticket zuweisen“ shall name one technician
of the installation and not only a whole pool or a whole group, and the action
„Benachrichtigung“ shall be able to address the technician of the ticket. The
decision of **ADR-0033** carries the two answers: the target of the `offer` and
the `assign` action gains the kind `user`, and the target of a `notify` action
gains the kind `assigned` — the assignees of the ticket, read from
`ticket_assignees` when the rule fires. The assignees of a ticket are the
technicians who work on it: the technicians of an assignment of the escalation
and the technician who took the ticket himself — the `claimed` and the
`accepted` step of the workflow write their row. The chain is split into
**WP-M14-150a** (the contracts), **WP-M14-150b** (the distribution),
**WP-M14-150c** (the workflow) and **WP-M14-150d** (the administration).

**The contracts of the new targets and their consumers (WP-M14-150a).** The
target of an `offer` and an `assign` action gains the kind `user` — one row of
`users` of the installation — and the target of a `notify` action becomes a
union: a target with an id (`user`, `pool`) and the target `assigned` without
an id. The configuration service writes the kind `assigned` as it is and checks
a user target against `users`; the kind `assigned` names no row and is never
checked. The dispatcher resolves the target `assigned` from the rows of
`ticket_assignees`: the assignees of the ticket receive the notification on
their own ntfy topic, a ticket without an assignee reaches nobody. The action
editor of the administration carries the new kinds, so a configuration with
them survives a save (ADR-0033).

**The distribution names the technician (WP-M14-150b).** The target kind
`user` of an `offer` and an `assign` action names one row of `users`: the
technician of the installation, if the account is active. A deactivated account
is nobody, so the distribution changes nothing — the rule of an empty pool.
The assignment writes the row of `ticket_assignees` and notifies the
technician on his own ntfy topic; the offer names him in `offered_to_user_id`,
so the ticket waits for him. The test of the distribution proves both cases,
the test of the actions proves the target `assigned` of a notification, and the
contract test proves the kinds of the targets (ADR-0033).

**The claim and the acceptance name the technician (WP-M14-150c).** The
`claimed` and the `accepted` step of the workflow write the row of
`ticket_assignees` in the transaction of the step, when a **user** performs it:
the technician who takes the ticket himself is an assignee of the ticket, and
the target `assigned` of a notification reaches him. A system action writes no
row — the escalation writes its own rows (ADR-0026, ADR-0033).

**The administration names the technician and the assigned recipient
(WP-M14-150d).** The kind select of the `offer` and the `assign` action offers
the kind `user` beside the readiness pool and the user group: the target
select then offers the technicians of the installation with their names — the
list the page already reads for the target of a notification. The kind select
of the `notify` action offers the kind `assigned`: the recipient is the
technician of the ticket, so the target select is replaced by a hint and the
saved action carries the kind without an id (ADR-0033).

**The readiness calendar names the technician of every shift (WP-M14-151, out of
band in phase 14).** The office reported that the readiness calendar answered
„nicht besetzt" behind shifts that clearly had a technician and that an admin
could not read who has the readiness when. The calendar had resolved the name of
a technician over the members of the pool — but the technician of a shift need
not be a member of its pool: `specs/04-oncall.md` §4a.2 makes the pool the
candidates of a swap, §4a.3 keeps `user_id` a foreign key to `users` and the
administration grid offers every active user for a grouped pool. **ADR-0032**
decides that the technician travels with the shift: the calendar range
`GET /api/v1/oncall/shifts` answers `technician` — the display data of `user_id`
in the shape of a pool member — next to every shift of the range, still guarded
by `oncall.read` like the members route of a pool, and the readiness calendar
names the technician of the shift it received and asks for the members of a pool
no more. The gate to the names stays in the web app (`oncall.read_names`,
WP-M14-131/132): a role without it reads „besetzt" instead of the name. A shift
with a technician is never called „nicht besetzt" — without a name in the answer
the row reads „besetzt". The swap rules, the iCal feed and the administration
grid keep their answers.

**The ticket history names the escalation and the notification (WP-M14-152, out
of band in phase 14).** The office read three rows „Benachrichtigung gesendet /
System" and one row „Eskaliert / System" and could answer neither where the
message went nor which stage fired. The audit trail stays: the history **names**
what happened. An `escalated` and an `escalation_note` event show the display
name of their stage from the stage chain (`GET /api/v1/escalation-stages`, §7.9)
— a raw stage key never enters the history. The firing of the first stage (§7.11)
is the arrival of the ticket: its audit row and its actions stay, its history row
is spared. The payload of `notification_sent` and `notification_failed` carries
the rule and the stage that queued the row, the name of the addressee of a
personal delivery and the name of the target the action was configured for
(§11.8) — display names only, no topic, no token, no address. The chain is split
into **WP-M14-152a** (the event of the outbox names rule, stage, recipient and
target), **WP-M14-152b** (the escalation names the target of the action) and
**WP-M14-152c** (the history renders stage, channel, recipient and target).

**The milestones of the ticket view are buttons (WP-M14-153, out of band in
phase 14).** The office reported that the „Workflow Stufen" of the ticket detail
was a pulldown menu: on a touch screen the milestone lies one step away and is
hidden behind the menu, and the confirmation of a milestone (the number of the
work order, the result of the acknowledge) appeared **above** the control that
opened it. The reachable milestones are buttons now: every stage the ticket can
still reach (`availableStages`, §7.10) stands next to the others, and the form
of the milestone stands **below** the buttons. The wording stays the wording of
the former selection — the name of the milestone, or the name of the step when
one milestone is reached by several steps — so no new text is needed; ADR-0017
names the new shape of the ticket view.

**The shift history shows who did what and when (WP-M14-154, out of band in
phase 14).** The office asked for a history of every shift — „erstellt am, von,
abgelehnt, zugewiesen von, an, angenommen von am" — and for it to open on a
click on a shift, also in the calendar. The append-only `oncall_events` trail
already carries every step (§4a.4, §4a.5); the chain adds the missing read side.
**WP-M14-154a** adds the shared history contract, `readShiftHistory` and
`GET /api/v1/oncall/shifts/:id/history` behind `oncall.read`; the answer carries
the type, the time, the acting person, the referenced person, the state
transition and the decline reason, never the raw payload. **WP-M14-154b** adds
the shift dialog and opens it from the readiness calendar and from an own shift,
with the existing `oncall.read_names` gate.

**The start page is the ticket list and the wall display shows reports and
statistics (WP-M14-155, out of band in phase 14).** The office asked for the
dashboard page to disappear: the start page is the ticket list, the statistics
took the place of the dashboard in the header menu, and the wall display shows
the latest reports on one side and the statistics on the other. The root route
redirects to `/tickets`; the snapshot contract gains `recentTickets` (the
twelve latest reports by `reported_at`, without test and suspected-spam
tickets); the statistics convert a duration of 60 minutes or more to hours with
at most one decimal.

**The readiness calendar marks the current day specially (WP-M14-156, out of band
in phase 14).** The office asked whether the current day is marked specially in
the readiness calendar. The cell of the Berlin calendar date of now keeps its
state colour and gains a ring and a semibold date number — today without a shift
is still ringed, so the gap of today is visible at a glance; the hint of the
calendar names the marker in `de` and `en`.

**The browser offers no install (WP-M14-157, out of band in phase 14).** The
browser showed no install prompt and no install chip in the address bar: the
manifest carried one icon only — `/logo.png` at 128 × 120 px declared with
`sizes: "any"`. Chrome and Edge need a **192 px and a 512 px icon** before they
offer an install, so they kept the app uninstallable and silent. The manifest
icons are a module now (`apps/web/src/pwa-manifest.ts`, `pwaIcons`) with the two
square PNGs of the logo on its own background (`apps/web/public/pwa-192x192.png`,
`apps/web/public/pwa-512x512.png`); the test reads the `IHDR` of the files, so a
declared size cannot drift away from the asset again. The web image also serves
`/manifest.webmanifest` as `application/manifest+json` — the default `mime.types`
of nginx has no entry for the extension. The stack still serves plain HTTP: over
an LAN IP or an unsecured domain no browser offers an install at all, and TLS
stays the task of the deployment (`docs/DEPLOYMENT.md` §HTTPS).

**The new user has a page of its own (WP-M14-158, out of band in phase 14).**
The office reported that the input mask „Benutzer anlegen" was glued below the
list of the users: the list of the installation is long, the mask lies far below
it, and the mask hides the list while it is open. The mask is a page of its own
now — `/admin/users/new` — and the list offers a button that opens it. The page
needs `user.write`, links back to the list and returns to the list after the
user is created; the editing of a user stays below the table. The same request
covers the mask of the new role (**WP-M14-159**) and of the new group
(**WP-M14-160**).

**The new role has a page of its own (WP-M14-159, out of band in phase 14).**
The input mask „Rolle anlegen" was glued below the list of the roles, the same
way the mask of the new user was (WP-M14-158). It is a page of its own now —
`/admin/roles/new` — and the list offers a button that opens it. The page needs
`role.write`, links back to the list and returns to the list after the role is
created; the grant editor of a role stays below the table.

**The new group has a page of its own (WP-M14-160, out of band in phase 14).**
The input mask „Gruppe anlegen" was glued below the list of the groups, the same
way the mask of the new user was (WP-M14-158). It is a page of its own now —
`/admin/groups/new` — and the list offers a button that opens it. The page needs
`user.write`, links back to the list and returns to the list after the group is
created; the editing of a group stays below the table.

**The new fault type has a page of its own (WP-M14-162, out of band in phase
14).** Every record of the administration was created with a mask that was glued
below or above the list of the records. The mask of the new fault type
(„Störungsart anlegen") is a page of its own now — `/admin/text-templates/new` — and
the list offers a button that opens it. The page needs `settings.write`, links
back to the list and returns to the list after the fault type is created; the
editing, the archiving and the delete stay where they were.

**The new detected error has a page of its own (WP-M14-163, out of band in phase
14).** The input mask of the new detected error was glued above the list of the
catalog, the same way the mask of the new fault type was (WP-M14-162). It is a page
of its own now — `/admin/detected-errors/new` — and the list offers a button that
opens it. The page needs `settings.write`, links back to the list and returns to the
list after the error is created; the editing, the archiving and the delete stay where
they were.

**The new API key has a page of its own (WP-M14-164, out of band in phase 14).**
The input mask of the new API key was glued above the list of the keys, the same way
the mask of the new fault type was (WP-M14-162). It is a page of its own now —
`/admin/api-keys/new` — and the list offers a button that opens it. The page needs
`apikey.write` and shows the one-time panel with the plaintext token after the key is
created; the revocation of a key stays on the list.

**The new webhook has a page of its own (WP-M14-165, out of band in phase 14).**
The input mask of the new webhook was glued above the list of the endpoints, the
same way the mask of the new API key was (WP-M14-164). It is a page of its own now
— `/admin/webhooks/new` — and the list offers a button that opens it. The page needs
`settings.write` and shows the signing secret after the endpoint is created.

**The new status has a page of its own (WP-M14-166, out of band in phase 14).**
The input mask of the new status was glued below the table of the statuses, the same
way the mask of the new webhook was (WP-M14-165). It is a page of its own now —
`/admin/statuses/new` — and the table offers a button that opens it. The page needs
`settings.write` and returns to the table after the status is created; the editing of
a status and the removal stay where they were.

**The delivery problem is a link and can be quit (WP-M14-161, out of band in
phase 14).** The office reported the badge „Zustellung gestört (1)" of the
settings menu: it is a text without a destination, it counts the channels of
the whole history of the outbox, and a single failure of the past keeps it red
forever. The badge becomes the **link** to the page `/admin/delivery`, where
the admin sees which channel fails, since when, with which machine code and
which messages never arrived — and where the problem is **quit**. The
quittature stores the *time* of the acknowledgement (the `settings` row
`notifications.delivery_acknowledged`, one entry per channel): every failure
after that time opens the problem again, so a solved problem stays solved and a
new one is never silent. The rule and the contract stand in
`specs/10-notifications.md` §11.8, §11.11 and §11.12; the package is split into
**WP-M14-161a** (the contracts, the service and the two routes), **WP-M14-161b**
(the page) and **WP-M14-161c** (the badge and the entry of the menu).

**The delivery problems of the API and their quittature (WP-M14-161a, out of band
in phase 14).** `apps/api/src/notifications/delivery.ts` reads the problems of the
channels: per channel the failed deliveries, the failures nobody acknowledged, the
times of the last failure and the last success, the machine code of the last
failure and the name of the user that acknowledged — plus the failed rows of the
outbox, the messages that never arrived. The times are the times of the
*failure* (`updated_at`), not the times of the queueing: a delivery that was
queued before the quittature and failed after it is a new failure. The
acknowledgement lives in the settings row `notifications.delivery_acknowledged` —
one entry per channel with the time and the user — and belongs to the instance,
not to a user. `GET /api/v1/notifications/delivery` (`notification.read`) and
`POST /api/v1/notifications/delivery/acknowledge` (`notification.write`) are the
two routes of §11.11; a body without a channel acknowledges every open problem.

**The page of the delivery problems (WP-M14-161b, out of band in phase 14).**
`apps/web/src/admin/delivery-page.tsx` (`DeliveryPage`, the route
`/admin/delivery`) shows the channels whose delivery failed: the number of the
failed deliveries, the failures nobody quit, the time of the last failure, the
machine code and the name of the user that quit the problem — and the messages
that never arrived with their ticket. `notification.write` offers the quittature
per problem and for all open problems; the page links to the channel
administration, where the cause of a failure usually waits (a wrong topic, a
missing secret, an unreachable server). The texts live in the `settings`
namespace in `de` and `en`.

**The badge of the settings menu is the link to the problems (WP-M14-161c, out of
band in phase 14).** The badge „Zustellung gestört (n)" of the settings menu is
a `NavLink` to `/admin/delivery` and counts the **open** problems — the channels
with a failure nobody quit. A quit problem is silent, a failure after the
quittature brings the badge back, and a solved problem stays solved. The
settings menu gained the entry „Zustellungsprobleme" (`auth.links.delivery`),
so the page is reachable without the badge too.

## 17. Work package rules for small models
**The comment of the office (WP-M5-17, WP-M5-18, out of band in phase 5).** The
office asked for three things on the ticket detail page: a saved comment must be
visible at once, the save must warn that the comment can no longer be corrected,
and the comment field should have a spell check. **WP-M5-17** fixes the first
one: the detail of a ticket is served from the `internal-tickets` cache with
`StaleWhileRevalidate` (WP-M5-07), so the refetch after a write answered with
the copy from before the write and the comment stayed invisible until the next
reload — a write to a ticket now drops that copy, and the service worker owns
the cache, so the invalidation belongs to the service worker
(`apps/web/src/sw.ts`, `isInternalTicketWrite`, `invalidateCachedTicket`).
**WP-M5-18** adds the warning: clicking "Kommentar speichern" opens a dialog
that names the append-only rule of §6.1, shows the text again and offers
"Speichern" and "Abbrechen"; the write runs only after the confirmation. The
spell check is the one of the browser — the field carries the interface language
and `spellCheck`, so it works offline and ships no extra download.



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

The Chromium of that gate is installed in the `check` job with
`npx playwright install --with-deps chromium`, whose `--with-deps` part downloads the
browser dependencies through apt from the Ubuntu package mirrors of the runner. A mirror
that cannot be resolved there (`Temporary failure resolving 'azure.archive.ubuntu.com'`,
apt exit `100`) is an infrastructure failure, not a code failure — **ADR-0018**: the step
writes `Acquire::Retries` and the apt timeouts into `/etc/apt/apt.conf.d`, caps one attempt
with `timeout 300` and repeats the install once; if the mirror stays unreachable it takes
the browser alone from the Playwright CDN and states that reduced prerequisite in the run
summary. The gate stays strict: a browser that neither apt nor the CDN can provide fails
the job, the version stays unpublished and nothing is skipped.

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
- **The pre-push hook enforces it.** `.husky/pre-push` counts the `refs/tags/*`
  lines on stdin and refuses a push with more than three tags. Every work package is
  pushed immediately with `git push --follow-tags`, never batched (WP-M1-28).
- **Promotion requires a successful publish, and a deploy follows it.** The `promote`
  job runs only when `needs.publish.result == 'success'`, so a failed image build
  cannot split `latest`. The `deploy` job runs after `promote`, only for the highest
  `v[0-9]*` tag, and calls `DEPLOY_WEBHOOK_URL` (HMAC `X-Signature-256` plus the
  `X-Deploy-Token` of the documented receiver); a missing target is a skipped
  notice, never a red run (WP-M1-28).
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

- mandatory messenger set for production — **resolved by ADR-0019**: every
  channel (ntfy, Telegram, Matrix, Signal, SMTP, Web Push, WhatsApp Web) is
  available; the admin configures them in the administration and names the
  channels that every critical ticket is notified through
  (`notifications.minimum_channels`); the environment stays the fallback,
- how the allocation of a readiness reaches the technician — **resolved by
  ADR-0021**: `oncall.assigned`, `oncall.swap_requested` and
  `oncall.unconfirmed_reminder` are notification events, the technician selects
  the channels in `/settings/notifications`, an allocated `DRAFT` readiness is
  confirmable and the outbox gains `event_type` plus a nullable `shift_id`
  (migration `0034`),
- hosting model (homelab behind Cloudflare vs. external server) — **resolved for
  the running instance**: a host checkout deployed with `docker compose up -d
--build` (ADR-0004, `docs/DEPLOYMENT.md`). The admin self-update is an
  out-of-band host update agent, never shell execution in the `api` container and
  never an OS password (ADR-0004, `specs/18-self-update.md`).
- multi-tenancy (default: no),
- contract-type deadlines stay deferred (ADR-0008); per-priority defaults resolved by ADR-0008 (WP-M6-03), editable in the administration (WP-M6-16); per-object-type deadlines (Objektart) are undecided — they need an ADR before a work package,
- the priority per object — **resolved by ADR-0029**: the standard is the setting
  `ticket.default_priority` (default `normal`), the deviations live in
  `object_priority_overrides` (WP-M14-134 … WP-M14-134i); the scope per object
  type (Objektart) stays undecided and needs its own ADR,
- the shape of the escalation configuration — **resolved by ADR-0017**: the workflow milestones are the stages, the deadlines per priority, the conditions and the actions live in the database and are maintained in `/admin/escalation`; the former manual stage catalogue is removed; the number of stages and the predecessor of a stage — **resolved by ADR-0023**: the stage set is a validated chain in the database, a stage names its predecessor or none and the predecessor carries the clock,
- whether shift swaps require admin approval by default (default: yes) — **resolved by
  ADR-0011**: approval defaults to `true`, the first acceptance stays atomic and the
  original technician remains responsible until approval,
- the shape of the ticket workflow transitions — **resolved by ADR-0025**: the steps are
  rows of `ticket_transitions` (migration `0041`) whose `from_status` and `to_status` are
  foreign keys onto `ticket_statuses.key` with `ON DELETE cascade`, the 22 steps of
  `PLAN.md` §7 are seeded by that migration and `transitionTicket()` reads the table
  (WP-M14-38a … WP-M14-38c),
- name and logo (working title: StörDesk).

Technical defaults already chosen in this plan:

- `@node-rs/argon2` for password hashing,
- `date-fns-tz` for time zones and DST,
- printable HTML QR stickers; optional `pdf-lib` later,
- Fastify OpenAPI stack,
- external notification services only,
- `nodemailer` as the SMTP transport of the e-mail channel (ADR-0009, WP-M7-07),
- `web-push` as the Web Push transport of the Web Push channel (ADR-0010, WP-M7-09).

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
