# WP-M2-65: the BMAcloud contract knows the Anlagentyp

format: small-model
status: planned
depends-on: WP-M2-64
phase: 2
context-budget: 16k tokens
spec: specs/17-bmacloud-sync.md §17.2 (reference endpoints), §17.3 (mapping)
spec-lines: 60

files-read:

- specs/17-bmacloud-sync.md §17.2, §17.3
- apps/api/src/integrations/bmacloud/client.ts — `listAnlagen` pattern (WP-M2-33)
- packages/shared/src/schemas/bmacloud.ts — `bmaAnlageSchema` (WP-M2-35)
- packages/shared/src/schemas/object.ts — `SYSTEM_TYPES` (WP-M2-04)

files-write:

- packages/shared/src/schemas/bmacloud.ts — `typ` in `bmaAnlageSchema`,
  `bmaAnlagentypSchema`, `externalTypeCategory()`
- apps/api/src/integrations/bmacloud/client.ts — `anlagentypen()`
- apps/api/src/integrations/bmacloud/__tests__/client.spec.ts — the new endpoint

interfaces:

- `BmaCloudClient.anlagentypen(): Promise<BmaAnlagentyp[]>` — one `GET /anlagentypen`
  (§17.2 reference call, still far below the rate limit of §17.6)
- `bmaAnlageSchema.typ: number | null | undefined` — the Anlagentyp id of the wire format
- `bmaAnlagentypSchema` — `{ typid: number, descr: string, herstellername?: string | null }`
- `externalTypeCategory(name: string | null, herstellername?: string | null):
  ObjectSystemType | null` — keyword classification into `BMA`, `LICHTRUF`, `RWA`, `EMA`,
  `SPRACHALARM`, else `null` (no `SONSTIGE` guess)

## Task

1. Add `typ` (nullable integer, optional) to `bmaAnlageSchema` and add
   `bmaAnlagentypSchema` for one `/anlagentypen` row; export both types from shared.
2. `createBmaCloudClient` gains `anlagentypen()` exactly like `listAnlagen()`: GET only,
   array check, `bma_bad_response` on anything else, the key never in an error message.
3. `externalTypeCategory` is the pure keyword table (German terms, case-insensitive):
   `lichtruf` → `LICHTRUF`; `sprachalarm`/`sprechanlage` → `SPRACHALARM`; `rwa`/`rauch`/
   `wärmeabzug`/`druckbelüftung` → `RWA`; `einbruch`/`überfall` → `EMA`; `brandmelde` and
   `bma` (also via `herstellername`) → `BMA`; unknown → `null`.
4. Test the endpoint with the fake `fetch` of `client.spec.ts` (array, non-array answer,
   `bma_not_configured`) and `externalTypeCategory` with the keyword table plus unknown.

## Non-goals

- No use of the new contract in the sync or the routes (WP-M2-65b).
- No UI use of the column or the category (WP-M2-66).
- No write back to BMAcloud and no `systems` seeding (§17.7).

## Acceptance

```bash
npm run check
```

Expected: all green; the client spec stays offline (fake `fetch` only).

## Handoff

- Files changed: the three files above plus `CHANGELOG.md`, `work-packages/README.md`
  and `docs/REPO-MAP.md`.
- Interfaces added: `anlagentypen()`, `bmaAnlageSchema.typ`, `bmaAnlagentypSchema`,
  `externalTypeCategory()`.
- Verified: —
- Follow-up WP: WP-M2-65b (`65b-bma-sync-external-type-write.md`, created with this
  rewrite) writes the column, then WP-M2-66 (the list column).
- Open question: none
