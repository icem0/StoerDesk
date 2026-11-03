# WP-M2-65b: the sync writes the external system type

format: small-model
status: implemented
depends-on: WP-M2-64, WP-M2-65
phase: 2
context-budget: 20k tokens
spec: specs/17-bmacloud-sync.md §17.3 (mapping), §17.4 (run behaviour), §17.6 (limits)
spec-lines: 60

files-read:

- specs/17-bmacloud-sync.md §17.3, §17.4
- packages/shared/src/schemas/bmacloud.ts — `bmaAnlagentypSchema` (WP-M2-65)
- apps/api/src/integrations/bmacloud/sync.ts — `mapAnlage`, `syncBmaAnlagen` (WP-M2-35)
- apps/api/src/integrations/bmacloud/routes.ts — the manual and scheduled pull (WP-M2-36)
- apps/api/src/db/schema.ts — `objects.externalType` (WP-M2-64)

files-write:

- apps/api/src/integrations/bmacloud/sync.ts — `MappedAnlage.externalType`, the type-name
  map, the diff and the update of the column
- apps/api/src/integrations/bmacloud/routes.ts — best-effort reference fetch per run
- apps/{api/src/integrations/bmacloud/__tests__/sync.integration.spec.ts,
  api/src/jobs/bma-sync.ts} — the live wire type lands as the reference name and both
  pull sites (manual route and pg-boss job) fetch the reference list best-effort

interfaces:

- `syncBmaAnlagen(database, anlagen, now?, anlagentypen?)` — the optional reference list
  fills `objects.external_type`; without it the column is left untouched
- the owned-object diff and update include `externalType`; an object whose stored
  `external_type` already matches stays `unchanged`

## Task

1. `syncBmaAnlagen` takes an optional fourth argument `anlagentypen: BmaAnlagentyp[]`.
   It builds `Map<number, string>` over `typid` → `descr`; anlage `typ` with no entry
   resolves to `null`.
2. Insert writes the resolved name (or `null`); the owned-object diff adds
   `externalType` so a changed name counts as `updated`, an equal one stays `unchanged`;
   without a reference list the column is neither read into the diff nor written.
3. Both pull sites fetch `anlagentypen()` best-effort before the pull — `routes.ts` (the
   manual trigger) and `jobs/bma-sync.ts` (the scheduled pull): a failing reference call
   never fails the run, it only omits the list, and only the fixed code is logged.
4. Extend `sync.integration.spec.ts`: a wire fixture with `typ` lands the `descr` name in
   `objects.external_type`; a second identical run reports `unchanged`; a run without the
   reference list leaves the stored value untouched.

## Non-goals

- No UI use of the column or the category (WP-M2-66).
- No `externalTypeCategory()` use in the API — it stays a pure shared helper.
- No `systems` seeding and no write back to BMAcloud (§17.7).

## Acceptance

```bash
npm run check
```

Expected: all green; the sync integration spec really runs (reachable database
required, otherwise report it as unverified).

## Handoff

- Files changed: the three files above plus `CHANGELOG.md`, `work-packages/README.md`
  and `docs/REPO-MAP.md`.
- Interfaces added: the optional `anlagentypen` argument of `syncBmaAnlagen`.
- Verified: `npm run check` green — typecheck, lint, 62 Vitest files, i18n:check and
  wp:check; the sync integration spec really ran against Postgres 16.
- Follow-up WP: WP-M2-66 (the object list column) — its document exists since WP-M2-64.
- Open question: none
