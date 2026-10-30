# WP-M1-10c: English documentation placeholders

format: small-model
depends-on: WP-M1-10, WP-M1-10b
phase: 1
context-budget: 16k tokens
spec: PLAN.md §3 (language rule), §4 (architecture and stack), §15 (maintainability); AGENTS.md "Conventions" (English everywhere), "i18n", "Data protection and security"; `specs/00-conventions.md` is still a placeholder, so `PLAN.md` and `AGENTS.md` are authoritative
spec-lines: 0

files-read:

- PLAN.md
- AGENTS.md
- docs/ARCHITECTURE.md
- docs/COMPLIANCE.md
- docs/GLOSSARY.md
- docs/I18N.md

files-write:

- docs/ARCHITECTURE.md
- docs/COMPLIANCE.md
- docs/GLOSSARY.md
- docs/I18N.md

interfaces:

- no code interface; the four `docs/` files keep their chapter structure and their
  cross references (`PLAN.md`, `specs/*`, `docs/REPO-MAP.md`, `SECURITY.md`)
- `docs/ARCHITECTURE.md`: monorepo areas (`apps/web`, `apps/api`, `packages/shared`),
  the request/data flow, the offline and outbox model, and a clear split between
  what is implemented and what is planned
- `docs/COMPLIANCE.md`: data-protection notes, the retention table (owner column
  names the operator of the instance) and the open points
- `docs/GLOSSARY.md`: domain vocabulary table — English term, the German UI term in
  parentheses where the UI label differs, meaning in English
- `docs/I18N.md`: locale roles (`de` default and reference, `en` complete), the eight
  web namespaces, the shared server/seed resources and the key rules

## Task

The four `docs/` placeholder files are German, which breaks the English rule of
`AGENTS.md`. Translate them, and while doing that correct statements that no longer
match the repository. Do not add new chapters and do not fill in specification
content that belongs to a later work package.

1. `docs/ARCHITECTURE.md`: English rewrite of the existing chapters (overview, data
   flow, offline/synchronisation model, non-functional pointer). Keep the pointer to
   `specs/14-nfr.md`. Name the modules that do not exist yet (`tickets`,
   `notifications`, `jobs`, the Dexie working copy) as planned, matching the
   `(geplant)` rows of `docs/REPO-MAP.md`, and name what is already live
   (`/api/v1/health`, the auth routes, the admin users routes).
2. `docs/COMPLIANCE.md`: English rewrite. Keep the retention table shape and its
   references to `specs/14-nfr.md` and `specs/00-conventions.md`, translate the owner
   column to the operator of the instance, keep the consent pointer to
   `specs/06-report-form.md` and the two open points.
3. `docs/GLOSSARY.md`: English table. Primary term in English, the German UI term in
   parentheses where the UI label differs (`Objekt`, `Anlage`, `Rolle`). Keep the
   `specs/` references and the 112 entry (emergency number, notice on the report form
   and the printed stickers — StörDesk is never an emergency call path).
4. `docs/I18N.md`: English rewrite. Keep the eight namespace names, the shared
   `server.{de,en}.json` and `seed.{de,en}.json` files, the `{ code, params }` error
   rule, the `namespace.section.element` key convention and
   `npm run i18n:check`.
5. Replace each German placeholder note with an English one: the file is a
   placeholder that is filled by the implementation of the matching work packages.

## Non-goals

- No change to `docs/DECISIONS.md` or the ADRs in `docs/DECISIONS/` (WP-M1-10d).
- No change to `docs/REPO-MAP.md` itself beyond the bookkeeping note below
  (WP-M1-11 normalizes its German rows).
- No new specification content: retention periods, ticket states or UI rules stay
  open until their slice is filled.
- No product text change: the emergency notice stays 112 only.
- No new docs files, no index, no links from `README.md` into `docs/`.

## Acceptance

```bash
npx prettier --check docs/ARCHITECTURE.md docs/COMPLIANCE.md docs/GLOSSARY.md docs/I18N.md
git grep -nI -i -E '\b(und|der|die|das|mit|nicht|bitte|siehe|für|bei|gemäß|Platzhalter|Kapitel|Sprache)\b' -- docs/ARCHITECTURE.md docs/COMPLIANCE.md docs/GLOSSARY.md docs/I18N.md
npm run check
```

Expected: Prettier reports no reformat, the German-word grep finds nothing (exit 1),
`npm run check` is green including `wp:check`, and the GitHub Actions `check` run of
the pushed commit is green — a local run alone is not enough.

## Handoff

- Files changed: the four docs above, plus `CHANGELOG.md`, `docs/REPO-MAP.md` and
  `work-packages/README.md`
- Interfaces added: none (documentation only)
- Verified: `npm run check` green — 16 files, 104 tests, `i18n:check ok`,
  `wp:check: 15 small-model WP checked, 0 failed`; Prettier reports no reformat and
  the German-word grep over the four docs finds nothing
- Deviation: the glossary lists English terms with the German UI term in
  parentheses, because a German product UI has to stay reachable from English docs
- Follow-up WP: WP-M1-10d (English ADRs and `docs/DECISIONS.md`), WP-M1-11 (repo map)
- Open question: none
