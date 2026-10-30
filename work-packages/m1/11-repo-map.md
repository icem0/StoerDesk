# WP-M1-11: repo map English and current through phase 1

format: small-model
status: done
depends-on: WP-M1-09e, WP-M1-10d
phase: 1
context-budget: 24k tokens
spec: AGENTS.md _Structure discipline_ and _Current status_; PLAN.md §16
spec-lines: 0

files-read:

- docs/REPO-MAP.md
- work-packages/README.md
- PLAN.md

files-write:

- docs/REPO-MAP.md
- work-packages/m1/11-repo-map.md

interfaces:

- `docs/REPO-MAP.md` sections: `## Structure`, `## Modules`, `## Conventions`,
  `## Implementation status`
- `## Modules` columns: module path | purpose | public API — one row per existing module,
  a module added by a later WP adds exactly one row here (`AGENTS.md` _Structure discipline_)
- size contract: max. 200 lines, tree down to level 3, one sentence per module

## Task

`docs/REPO-MAP.md` is the only remaining German document in `docs/`, which breaks the
English rule of `AGENTS.md` (noted as a deviation in the map itself since WP-M1-10 and
closed here). Its content is also stale: it still shows the planned tree of WP-M1-01
without the folders that phase 1 actually created, and its module table is missing the
user schemas of WP-M1-09, the API bootstrap `src/index.ts`, the route table
`apps/web/src/routes/index.tsx`, the shared i18n `t.ts` and the ADR files of WP-M1-10d.

1. Rewrite the map in English: heading and rules, `## Structure`, `## Modules`,
   `## Conventions`, `## Implementation status`.
2. Structure from the real tree (`find apps packages -maxdepth 3 -type d` without
   `node_modules`/`dist`), level 3 only, planned-but-empty folders marked as planned.
3. Module table: one row per module that exists after phase 1 (db schema, client,
   migrate, both seeds, migrations, password, session, session plugin, auth routes,
   permission guard, admin users, admin roles, notification channels, env config,
   shared permissions/schemas/i18n, web i18n, api client, `usePermission`, login form,
   session guard, users page, roles page, route table, App shell, test helper,
   scripts, workflows, issue forms, Docker/Compose files, governance docs) with
   purpose and public API.
4. Conventions short form, and an implementation status section that names the
   implemented WPs and what is still planned.

## Non-goals

- No code, schema, i18n or test change — documentation only.
- No new spec slices, no PLAN.md scope change, no new work packages.
- No second index document: `docs/REPO-MAP.md` stays the single place for structure.

## Acceptance

```bash
npm run check
wc -l docs/REPO-MAP.md
```

Expected: green and at most 200 lines; the map contains no German prose, lists every
phase 1 module exactly once and matches the directory tree of the checkout.

## Handoff

- Files changed: `docs/REPO-MAP.md` and this document, plus the bookkeeping outside
  `files-write` (`work-packages/README.md` open follow-ups row, `PLAN.md` §16,
  `AGENTS.md` _Current status_, `CHANGELOG.md`)
- Interfaces added: none — a map documents, it does not export. The contract is the
  shape: `## Structure`, `## Modules` (columns module / purpose / public API),
  `## Conventions`, `## Implementation status`, max. 200 lines.
- Verified: `npm run check` green locally, map line count checked with `wc -l`, tree
  compared with `find apps packages -maxdepth 3 -type d` (no `node_modules`, no `dist`).
- Deviation: the legacy WP document was rewritten into the small-model format before
  implementation, as `work-packages/README.md` requires for legacy plans.
- Follow-up WP: WP-M1-12 (Playwright smoke test "login as admin works")
- Open question: none
