# WP-M2-35: the BMAcloud sync service

format: small-model
status: planned
depends-on: WP-M2-33, WP-M2-34
phase: 2
context-budget: 20k tokens
spec: specs/17-bmacloud-sync.md §17.3 (mapping), §17.4 (behaviour, conflicts,
deactivation), §17.6; ADR-0003 (mapping, conflict policy)
spec-lines: 90

files-read:

- specs/17-bmacloud-sync.md §17.3, §17.4
- apps/api/src/integrations/bmacloud/client.ts — `BmaAnlage` (WP-M2-33)
- apps/api/src/db/schema.ts — `objects`, `systems`, `bmaSyncRuns` (WP-M2-34)
- apps/api/src/objects/service.ts — how objects and systems are written today
- apps/api/src/objects/qr.ts — `generateQrToken()` for inserted objects

files-write:

- apps/api/src/integrations/bmacloud/sync.ts
- packages/shared/src/schemas/bmacloud.ts
- packages/shared/src/schemas/index.ts

interfaces:

- `bmaAnlageSchema` — the Zod shape of one Anlage as far as StörDesk reads it
  (`aid`, `nr`, `firma`, `anlagenort`, `str`, `plz`, `ort`, `status`)
- `mapAnlage(anlage): MappedAnlage | { conflict: 'invalid_object_no' }` — the pure
  §17.3 mapping, no database access
- `syncBmaAnlagen(database, anlagen, now?): Promise<BmaSyncRunResult>` — one transaction
  per run, returns `{ status, total, created, updated, unchanged, deactivated, conflicts }`
- conflict codes `invalid_object_no` (whitespace or empty `nr`) and
  `object_no_taken` (a local object without `external_id` holds that `object_no`)

## Task

1. `mapAnlage` implements §17.3 verbatim: `object_no = nr`, `name = firma` plus
   ` – anlagenort` when that value is non-empty and different, `street = str`
   (`house_number` stays null), `postal_code = plz` trimmed, `city = ort`,
   `active = (status === 'active')`, `external_id = aid`. It never touches `notes`,
   the contact fields or `qr_token`.
2. `syncBmaAnlagen` matches by `external_id` first, then by `lower(object_no)`
   (`specs/02-data-model.md` §4.3.1). Owned objects are updated for name, address and
   the active flag; an unowned object with the same `object_no` is a conflict row and is
   never overwritten; a new object is inserted with a generated `qr_token`
   (`generateQrToken()`, WP-M2-02) and is never re-tokened on a later run.
3. Objects that carry an `external_id` but are missing from the pull are set to
   `active = false` — never deleted (`tickets.object_id` is `ON DELETE RESTRICT`).
4. The run writes one `bma_sync_runs` row: `started_at` at the start, `finished_at` at the
   end, `status` `SUCCESS` / `PARTIAL` (conflicts present) / `FAILED` (with `error_code`),
   the five counters and the conflicts as a jsonb array of
   `{ code, objectNo, aid, detail }` — `detail` never contains a contact field.
5. Test `apps/api/src/integrations/bmacloud/__tests__/sync.integration.spec.ts` with
   synthetic fixtures only: create, update, unchanged, deactivate, both conflict codes,
   the counters and the local fields (`notes`, contact, `qr_token`) staying untouched.

## Non-goals

- No HTTP route and no pg-boss job (WP-M2-36); the test calls the function directly.
- No `systems` seeding from `anlagentypen` (§17.7).
- No photo, ticket or contact import.
- No CSV import/export — separate phase 10 WP.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the integration spec really runs (reachable database required,
otherwise report it as unverified).

## Handoff

- Files changed: the three files above plus the integration spec, `docs/REPO-MAP.md`,
  `work-packages/README.md`
- Interfaces added: `bmaAnlageSchema`, `mapAnlage`, `syncBmaAnlagen`, `BmaSyncRunResult`
- Verified: —
- Follow-up WP: WP-M2-36 (admin API and the pg-boss job)
- Open question: none
