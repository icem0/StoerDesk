# 02 — Data model (chapter 4)

**Chapter:** 4 (except 4.1 — that is covered by [`01-rbac.md`](01-rbac.md))
**Scope:** ~250 lines across phases; filled for the phase 2 tables
**Status:** taken from `PLAN.md` §6 (core tables and indexes), §3 (localized seed
data), §10 (report form) and §11 (objects, QR, CSV) and reviewed for WP-M2-00.
The `object_no` rule of §4.3.1 was decided with the product owner on 2026-10-30.

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

### 4.7 Tables of later phases (named only)

`contracts_refs`, `tickets` (with `object_id`/`system_id` UUID foreign keys,
`ticket_no`, `client_uuid`, `status_token`), `ticket_events`, `ticket_photos`,
`ticket_pauses`, `old_qr_tokens` (WP-M2-02), `api_keys`,
`notification_channels`, `push_subscriptions`, `outbox`, `settings`,
`oncall_pools`, `oncall_shifts`, `oncall_swap_requests`, `oncall_events` —
each is detailed in the spec slice of its own phase before its first WP. The
`tickets` link to objects and systems is a UUID foreign key into the tables
above; the object is chosen from the object list.
