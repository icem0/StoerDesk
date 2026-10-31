# 02 — Data model (chapter 4)

**Chapter:** 4 (except 4.1 — that is covered by [`01-rbac.md`](01-rbac.md))
**Scope:** ~250 lines across phases; filled for the phase 2 tables
**Status:** taken from `PLAN.md` §6 (core tables and indexes), §3 (localized seed
data), §10 (report form) and §11 (objects, QR, CSV) and reviewed for WP-M2-00.
§4.7 (`old_qr_tokens`) is filled from `PLAN.md` §6/§11 and reviewed for
WP-M2-02. The `object_no` rule of §4.3.1 was decided with the product owner on
2026-10-30. §4.8–§4.11 (`tickets`, `ticket_events`, `ticket_photos`,
`ticket_no_counters`) are filled from `PLAN.md` §6/§7/§10 and reviewed on
2026-10-31 for WP-M2-04: the `ticket_no` format `ST-<year>-<counter>` and the
`status_token` generation **with the ticket** were decided then.

> The source of this slice is `PLAN.md` §6. Details that `PLAN.md` settled are
> marked **(plan)**. Tables of later phases are named here but detailed in the
> slice of their own phase; until then `PLAN.md` §6 is authoritative for them.

## 4 — Data model

### 4.1 RBAC tables

`users`, `sessions`, `roles`, `permissions`, `role_permissions`, `user_roles`,
`user_permissions`, `groups`, `user_groups` — see `specs/01-rbac.md` §4.1.

### 4.2 General rules

- Every domain table uses a UUID v7 primary key (database default
  `gen_uuid_v7()`, ADR-0002) and UTC `timestamptz` columns `created_at` and
  `updated_at`. Server time is authoritative. **(plan)**
- Join tables use composite keys instead of their own UUIDs; event tables are
  append-only and protected against `UPDATE`/`DELETE` by trigger. **(plan)**
- Objects are removed by **soft delete** (`active = false`); history keeps
  pointing at them. **(plan)**
- StörDesk tracks no money amounts. User-facing names never live in the schema:
  localized text is an i18n or seed resource, never a column value used as a
  label. **(plan)**

### 4.3 `objects` — the maintenance object list

The object list is the list of **maintenance objects**; it is maintained through
the admin UI (object CRUD, WP-M2-01) and is the only source the "object"
assignment of a report or ticket can be chosen from.

| Column | Type | Rule |
| --- | --- | --- |
| `id` | UUID v7 | primary key — the internal reference (e.g. `tickets.object_id`) |
| `object_no` | text, not null | natural key of the list row, see §4.3.1 |
| `name` | text, not null | display name |
| `street`, `house_number`, `postal_code`, `city` | text | address; `city` feeds the list filter **(plan, §11)** |
| `contact_name`, `contact_phone`, `contact_email` | text, nullable | on-site contact |
| `qr_token` | text, nullable | 22 URL-safe random chars, filled from WP-M2-02 on; the QR URL never contains `object_no` **(plan, §11)** |
| `external_id` | text, nullable | id in a foreign system (ERP, work-order system) |
| `active` | boolean, default `true` | soft delete flag |
| `notes` | text, nullable | internal notes |

### 4.3.1 `object_no` — the object number (decided 2026-10-30)

- **User input, required, never generated.** There is **no number pool table**:
  the object list itself is the maintained table, and each row carries exactly
  one number.
- **Unique case-insensitively**: enforced by a unique index over
  `lower(object_no)`; the value is stored trimmed. A duplicate is rejected with
  `422` / `object_no_taken` (API, WP-M2-01).
- Format: `^[A-Z0-9][A-Z0-9_-]{0,31}$` — digits, upper-case letters, `_` and
  `-`, max. 32 characters. Example: `12345_01` (site `12345`, sub-unit `01`).
  The number is free text for the organisation, **not** parsed or split.
- **Referencing:** internal links (`tickets`, photos, events) use the UUID
  foreign key — tickets keep a UUID, not the number. Everything outside the
  database uses `object_no` as the human- and system-readable key: the object
  picker, search, stickers and print sheets, CSV import upsert and
  `PUT/DELETE /objects/{object_no}` of the object API. **(plan, §11)**

### 4.4 `systems` — maintenance subsystems of an object

| Column | Type | Rule |
| --- | --- | --- |
| `id` | UUID v7 | primary key |
| `object_id` | UUID | foreign key to `objects`, `ON DELETE CASCADE` **(plan)** |
| `type` | text, not null | check over `BMA`, `LICHTRUF`, `RWA`, `EMA`, `SPRACHALARM`, `SONSTIGE` **(plan, §6)** |
| `label` | text, not null | display label for this installation |
| `qr_token` | text, nullable | own optional QR code (report form pre-fills the system then) **(plan, §10)** |
| `created_at`, `updated_at` | timestamptz | as §4.2 |

A system has **no own number column**: if an organisation numbers sub-units,
that shows up in the `object_no` format of the list row it maintains (e.g.
`12345_01`), not as a generated suffix.

### 4.5 `text_templates` and `text_template_translations`

- `text_templates`: `id` UUID v7, `key` text not null **unique** (stable
  machine key), timestamps.
- `text_template_translations`: composite primary key (`template_id`, `locale`),
  `template_id` foreign key `ON DELETE CASCADE`, `locale` with check
  `IN ('de','en')`, `text` text not null.
- The nine BMA standard texts of the report form are seeded as templates with a
  `de` **and** an `en` row from
  `STANDARD_TEXTS: Record<Locale, StandardText[]>` in `packages/shared` — seed
  data is a localized resource, never a German literal in API code. **(plan, §3)**
- The raw specification did not carry the text list, so the nine texts are
  drafted here (proposed, refinable via the admin template editor; the demo
  seed never overwrites edits):

| `key` | `de` | `en` |
| --- | --- | --- |
| `bma.total_outage` | Brandmeldeanlage fällt komplett aus | Fire alarm system completely out of service |
| `bma.malfunction_display` | Störungsmeldung an der Brandmelderzentrale | Fault indication on the alarm control panel |
| `bma.false_alarm` | Falschalarm ohne erkennbaren Grund | False alarm without identifiable cause |
| `bma.smoke_detector_fault` | Rauchmelder defekt oder verschmutzt | Smoke detector defective or soiled |
| `bma.manual_callpoint_fault` | Handdruckmelder defekt | Manual call point defective |
| `bma.power_supply_fault` | Störung der Stromversorgung / Batterie | Power supply or battery fault |
| `bma.line_fault` | Leitungsstörung / Linie gestört | Line/circuit fault |
| `bma.transmission_fault` | Störung der Alarmübertragung | Transmission to the emergency services fails |
| `bma.ups_time_overdue` | Aufschaltzeit überschritten | Delay before alarm transmission exceeded |

### 4.6 Indexes and constraints for the phase 2 tables

- unique index `lower(objects.object_no)` (§4.3.1)
- unique `objects.qr_token`, unique `systems.qr_token` **(plan, §6)**
- `objects_name_idx`, `objects_active_idx`
- `systems_object_id_idx`, `systems_type_idx` **(plan, §6)**
- unique `old_qr_tokens.token`, `old_qr_tokens_object_id_idx`,
  `old_qr_tokens_expires_at_idx` (§4.7, WP-M2-02)

### 4.7 `old_qr_tokens` — retired QR tokens (WP-M2-02)

A regeneration never breaks a printed sticker immediately: the previous token
keeps working as a redirect until it expires.

| Column | Type | Rule |
| --- | --- | --- |
| `id` | UUID v7 | primary key |
| `object_id` | UUID | foreign key to `objects`, `ON DELETE CASCADE` |
| `token` | text, not null | the retired 22-character token, **unique** over all retired and current tokens |
| `expires_at` | timestamptz, not null | `now() + 30 days` by default; `now()` when the admin blocks the old token immediately |
| `created_at` | timestamptz | as §4.2 |

Rows are looked up by exact token and must be `expires_at > now()` to redirect.
Several retired tokens may point at the same object; resolution always uses the
object's current `objects.qr_token`. Expired rows are deleted by the daily
pg-boss cleanup job (WP-M2-02b). The table has no `updated_at`: a retired token
is never edited.

### 4.8 `tickets` — one malfunction report (WP-M2-04)

Created by the public report endpoint (`06-report-form.md` §7.3) and later by the
internal form; every state change of phase 4 is an event in §4.9, not a rewrite
of this row.

| Column | Type | Rule |
| --- | --- | --- |
| `id` | UUID v7 | primary key |
| `ticket_no` | text, not null, **unique** | human-readable number, database default `next_ticket_no()` — format and counter see §4.11 |
| `object_id` | UUID, not null | foreign key to `objects`, **`ON DELETE RESTRICT`**: objects are only soft-deleted (§4.2), so a report never loses its object |
| `system_id` | UUID, nullable | foreign key to `systems`, **`ON DELETE SET NULL`**: the object sync of WP-M2-01 deletes system rows, the report keeps the object |
| `status` | text, not null, default `'NEW'` | check over `NEW`, `IN_REVIEW`, `WORK_ORDER_CREATED`, `OFFERED`, `ASSIGNED`, `ACCEPTED`, `ACKNOWLEDGED`, `CLOSED`, `CANCELLED` **(plan, §7)** — `DECLINED` is an event, never a status |
| `priority` | text, not null, default `'normal'` | check over `low`, `normal`, `high`, `critical`; QR reports are always `normal` **(plan, §10)** |
| `title` | text, nullable | short summary filled by the office during review; the public form sends none |
| `description` | text, nullable | free text of the report, max. 4000 characters |
| `fault_template_keys` | text[], not null, default `{}` | multi-select of `text_templates.key` (§4.5) — machine keys, never translated text **(plan, §3)** |
| `source` | text, not null, default `'QR'` | check over `QR`, `INTERNAL`, `API`; statistics group by source **(plan, §13)** |
| `reported_at` | timestamptz, not null | device capture time, or server time when the clock differed (§4.8.1) |
| `received_at` | timestamptz, not null, default `now()` | server time is authoritative **(plan, §15)** |
| `clock_skewed` | boolean, not null, default `false` | `true` when device and server time differ by more than 10 minutes **(plan, §10)** |
| `deadline_at` | timestamptz, not null | trusted base timestamp + deadline length; 72 h default, per-priority rules arrive in phase 6 **(plan, §9)** |
| `reporter_name`, `reporter_phone`, `reporter_email` | text, nullable | reporter contact of the form — phone **or** e-mail is required by the endpoint, and no PII reaches a log **(plan, §15)** |
| `client_uuid` | uuid, nullable, **unique** | idempotency key of the offline outbox replay **(plan, §10)** |
| `status_token` | text, nullable, **unique** | 22 URL-safe random chars, generated **with the ticket** (decided 2026-10-31) so `/s/<token>` exists from the first report; same entropy rule as `qr_token` **(plan, §15)** |
| `suspected_spam` | boolean, not null, default `false` | set by the spam package WP-M2-07; the report is still stored **(plan, §10)** |
| `parent_ticket_id` | UUID, nullable | foreign key to `tickets`, `ON DELETE SET NULL` — "add to existing" of the duplicate hint WP-M2-08 |
| `created_at`, `updated_at` | timestamptz | as §4.2 |

`assigned_user_id`, `reviewed_by_user_id`, `review_started_at`,
`offered_to_user_id`, `offer_escalated_at`, the work-order type and number, the
response timestamps and `ticket_pauses` belong to the **workflow phase 4**
(`PLAN.md` §6/§7) and arrive with that phase by `ALTER TABLE`, because no phase 2
path writes them; the index `tickets(assigned_user_id, status)` of `PLAN.md` §6
comes with them.

Indexes: `tickets_ticket_no_key` (unique), `tickets_client_uuid_key` (unique —
the idempotency index of `PLAN.md` §6), `tickets_status_token_key` (unique),
`tickets_object_id_reported_at_idx` and `tickets_status_idx` (both `PLAN.md` §6),
`tickets_parent_ticket_id_idx` (duplicate hint).

#### 4.8.1 Device clock difference (plan §10)

The server keeps the reported time from the request only when it is within ±10
minutes of server time. Outside that window it stores `reported_at =
received_at` and sets `clock_skewed = true`. `deadline_at` is always computed
from the timestamp the server actually trusts.

### 4.9 `ticket_events` — append-only audit trail (WP-M2-04)

| Column | Type | Rule |
| --- | --- | --- |
| `id` | UUID v7 | primary key |
| `ticket_id` | UUID, not null | foreign key to `tickets`, `ON DELETE CASCADE` |
| `type` | text, not null | `created`, `work_order_set`, `declined`, `reopened`, `cancelled`, `comment`, … — **no check constraint**: later phases add event types without a migration |
| `actor_kind` | text, not null | check over `user`, `public`, `system` — who triggered the event |
| `actor_user_id` | UUID, nullable | foreign key to `users`, `ON DELETE SET NULL`; `NULL` for `public` and `system` actors |
| `payload` | jsonb, not null, default `{}` | event data (decline reason, acknowledge result, submission details) |
| `created_at` | timestamptz, not null, default `now()` | event time; **no `updated_at`** |

Corrections are new events, never edits (`AGENTS.md`, _Changes stay
traceable_). The trigger `ticket_events_append_only` blocks `UPDATE` and
`DELETE` and raises `ticket_event_append_only` — the same mechanism as
`protect_system_roles` in migration 0001 **(plan, §15 Audit)**. The one allowed
`DELETE` is the `ON DELETE CASCADE` of the ticket itself, recognised through
`pg_trigger_depth() > 1`: a trail never outlives its ticket, and there is no
path that removes single events.

### 4.10 `ticket_photos` — photo metadata (WP-M2-04c)

| Column | Type | Rule |
| --- | --- | --- |
| `id` | UUID v7 | primary key |
| `ticket_id` | UUID, not null | foreign key to `tickets`, `ON DELETE CASCADE` |
| `file_path` | text, not null, **unique** | path **relative to `UPLOAD_DIR`**: `tickets/<ticket_id>/<id>.<ext>`; the volume is never served directly **(plan, §15)** |
| `mime_type` | text, not null | check over `image/jpeg`, `image/png` — verified by magic bytes, never by the client claim |
| `size_bytes` | integer, not null | decoded size, capped by `UPLOAD_MAX_BYTES` (default 10 MB) |
| `width_px`, `height_px` | integer, nullable | read from the file when a decoder is available; no storage rule depends on it |
| `uploader_user_id` | UUID, nullable | foreign key to `users`, `ON DELETE SET NULL`; `NULL` for anonymous reporters |
| `created_at` | timestamptz | as §4.2 |

Index `ticket_photos_ticket_id_idx`; at most 6 photos per report
(`PLAN.md` §10). The 24-month photo retention of `PLAN.md` §15 is a phase 10
privacy job.

### 4.11 `ticket_no_counters` and `next_ticket_no()` (decided 2026-10-31)

| Column | Type | Rule |
| --- | --- | --- |
| `year` | integer | primary key — one row per calendar year (server time) |
| `next_value` | integer, not null | last allocated counter of that year |

`next_ticket_no()` is a `plpgsql` function that allocates through
`INSERT … ON CONFLICT (year) DO UPDATE SET next_value = next_value + 1 RETURNING
next_value` — one row lock per year, so concurrent reports never collide — and
returns `ST-<year>-` plus `next_value` left-padded to four digits
(`ST-2026-0001`). The number is a **readable key, not an invoice number**: a
rolled back transaction may leave a gap and a number is never re-used. The column
default keeps the rule inside the database, so no service has to remember it.

### 4.12 Tables of later phases (named only)

`contracts_refs`, `ticket_pauses`, `api_keys`, `notification_channels`,
`push_subscriptions`, `outbox`, `oncall_pools`, `oncall_shifts`,
`oncall_swap_requests`, `oncall_events` — each is detailed in the spec slice of
its own phase before its first WP. The `tickets` link to objects and systems is a
UUID foreign key into the tables above; the object is chosen from the object
list.
