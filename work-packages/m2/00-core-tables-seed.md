# WP-M2-00: Core object tables and demo seed

format: small-model
depends-on: WP-M1-12
phase: 2
context-budget: 25k tokens
spec: PLAN.md §6 (`objects`, `systems`, `text_templates`,
`text_template_translations`, index list) — **blocked until `specs/02-data-model.md`
is filled from PLAN.md §6 and reviewed**; until then PLAN.md §6 is authoritative
spec-lines: 60

files-read:

- PLAN.md (§3 seed localization, §6 core tables and indexes)
- specs/02-data-model.md (must be filled before this WP starts)
- apps/api/src/db/schema.ts
- apps/api/src/db/seed-base.ts
- apps/api/src/db/**tests**/helpers/testDatabase.ts
- work-packages/m2/01-objects-crud.md

files-write:

- apps/api/src/db/schema.ts
- apps/api/src/db/migrations/0002_core_object_tables.sql
- apps/api/src/db/seed-demo.ts
- packages/shared/src/seed/standard-texts.ts

interfaces:

- tables `objects`, `systems`, `text_templates`, `text_template_translations`
- `seedDemo(db): Promise<DemoSeedResult>` — run with `npx tsx src/db/seed-demo.ts`
- `STANDARD_TEXTS: Record<Locale, StandardText[]>` in `@stoerdesk/shared` — the
  localized standard texts are a resource, never a German literal in API code
  (`PLAN.md` §3)

## Task

1. Add the four tables of `PLAN.md` §6 to `apps/api/src/db/schema.ts`: UUID v7
   defaults from `uuidDefault`, `objects` with `object_no`, `name`, address, contact,
   `qr_token` (unique, nullable until WP-M2-02 fills it), `external_id`, `active`,
   `notes`; `systems` with an object FK (`onDelete: 'cascade'`), a `type` check over
   `BMA`, `LICHTRUF`, `RWA`, `EMA`, `SPRACHALARM`, `SONSTIGE`, `label` and an optional
   own `qr_token`; `text_templates` with a stable `key` plus
   `text_template_translations` with composite key (`template_id`, `locale`) and a
   `locale IN ('de','en')` check.
2. Indexes at minimum: `objects_name_idx`, `objects_active_idx`,
   `systems_object_id_idx`, `systems_type_idx`, unique `objects.qr_token` and
   `systems.qr_token`. Generate with
   `npm run db:generate -w @stoerdesk/api`.
3. `packages/shared/src/seed/standard-texts.ts`: the nine BMA standard texts of
   `specs/02-data-model.md` with `de` and `en` variants and a stable key each.
4. `apps/api/src/db/seed-demo.ts`: idempotent seed of three example objects
   (Musterstraße 1–3) with one `BMA` system each and the nine text templates with
   both translations. Natural keys (`objects.name` + address, `text_templates.key`)
   decide existence, so a second run creates nothing; the seed never overwrites
   edits made in the admin UI. The CLI prints counts only.
5. Integration test `apps/api/src/db/__tests__/seedDemo.integration.spec.ts`
   (excluded from `files-write` per `PLAN.md` §17): after migrate + `seedRbac` +
   `seedDemo` the counts match, every template has a `de` and an `en` row, the second
   run is a no-op, an edited translation stays edited, and the `systems.type` and
   `locale` checks reject bad values. Skipped without a reachable database.

## Non-goals

- No object API, no search, no CRUD routes (WP-M2-01), no QR generation or printing
  (WP-M2-02, WP-M2-03), no `old_qr_tokens` (WP-M2-02).
- No `contracts_refs`, no `tickets` or ticket tables — those arrive with their own
  phase work packages.
- No template editor UI, no per-organisation template management.
- No demo tickets and no demo users beyond the WP-M1-06 bootstrap admin.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

With a reachable database: `npx tsx src/db/migrate.ts`,
`npx tsx src/db/seed-rbac.ts`, `npx tsx src/db/seed-base.ts` and
`npx tsx src/db/seed-demo.ts` twice with identical counts, plus the integration spec
passes. Without a database the spec skips and the CI `check` job (PostgreSQL 16
service) is the executed acceptance.

## Handoff

- Files changed: the four files above plus the test file and the bookkeeping outside
  `files-write` (`docs/REPO-MAP.md`, `AGENTS.md`, `CHANGELOG.md`,
  `work-packages/README.md`)
- Interfaces added: four tables, `seedDemo`, `STANDARD_TEXTS`
- Follow-up WP: WP-M2-01 object CRUD (its `depends-on` is this WP), WP-M2-02 QR
  generation fills `objects.qr_token`
- Open question to settle in the spec slice: whether `object_no` is user input or a
  generated value — decide in `specs/02-data-model.md`, do not improvise in code
