# WP-M10-01: API and hardening specification, ADRs and phase-10 split

format: small-model
status: done
depends-on: —
phase: 10
milestone: m10
context-budget: 24k tokens
spec: PLAN.md §11, §15, §16 phase 10, §20; specs/08-objects-api.md; specs/14-nfr.md
spec-lines: 200

files-read:

- PLAN.md (§6 data model, §11 objects and API, §15 NFR, §16 phase 10, §19, §20)
- specs/08-objects-api.md (placeholder for §9.4/§9.5)
- specs/14-nfr.md (placeholder)
- work-packages/m9/01-dashboard-stats-spec-and-split.md (phase-split format)
- docs/WP-TEMPLATE.md

files-write:

- specs/08-objects-api.md, specs/14-nfr.md
- docs/DECISIONS/0013-external-api-keys-webhooks-openapi.md, docs/DECISIONS/0014-privacy-retention-and-restore-drill.md, docs/DECISIONS.md
- work-packages/m10/ (WP-M10-02 … WP-M10-18, each file in this commit)
- PLAN.md §16, work-packages/README.md, docs/REPO-MAP.md, CHANGELOG.md

interfaces:

- `specs/08-objects-api.md` §9.4 — CSV import contract
- `specs/08-objects-api.md` §9.5 — API keys, external object/ticket API, webhooks, OpenAPI
- `specs/14-nfr.md` §15.2/§15.3 — retention, export/erasure, backup and restore drill
- ADR-0013 and ADR-0014
- `work-packages/m10/` — the phase-10 split in numeric implementation order

## Task

1. Replace §9.4/§9.5 of `specs/08-objects-api.md` with the CSV import, API-key,
   external object/ticket, webhook and OpenAPI contract from `PLAN.md` §11.
2. Replace `specs/14-nfr.md` with the security, privacy, retention, availability,
   restore, performance, maintainability, time and audit contract.
3. Resolve the external-API and privacy decisions with ADR-0013 and ADR-0014;
   settle the open phase-2 retention questions for `report_throttle.ip` and
   `bma_sync_runs.conflicts`.
4. Create the phase-10 work packages WP-M10-02 … WP-M10-18 in `work-packages/m10/`
   in numeric order.
5. Record the split in `PLAN.md` §16, `work-packages/README.md`,
   `docs/REPO-MAP.md` and `CHANGELOG.md`. No product code in this package.

## Non-goals

- No schema, service, route, job, UI or test code.
- No phase-11 work.
- No annotation of the internal office routes for OpenAPI.

## Acceptance

```bash
npm run wp:check
npm run check
```

Expected: `wp:check` green with every new WP file valid; `check` green because
this package changes documentation only. The E2E gate is reported as skipped
when no browser is available. No Docker gate is part of this WP.

## Handoff

- Files changed: the two spec slices, ADR-0013/0014, the decision index, the m10
  WP files, `PLAN.md` §16, `work-packages/README.md`, `docs/REPO-MAP.md` and
  `CHANGELOG.md`
- Interfaces added: the phase-10 contracts above
- Verified: `npm run wp:check` and `npm run check` (E2E skipped: no Chromium)
- Follow-up WP: WP-M10-02 … WP-M10-18 (each file exists in this commit)
- Open question: none
