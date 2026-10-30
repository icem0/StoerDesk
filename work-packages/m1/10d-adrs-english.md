# WP-M1-10d: English ADRs and decision index

format: small-model
depends-on: WP-M1-10c
phase: 1
context-budget: 14k tokens
spec: PLAN.md §3 (language rule), §15 (maintainability); AGENTS.md "Conventions" (English everywhere), "Data protection and security"; the WP-M1-10 split note (ADRs with English slugs move to WP-M1-10d); `specs/00-conventions.md` is still a placeholder, so `PLAN.md` and `AGENTS.md` are authoritative
spec-lines: 0

files-read:

- AGENTS.md
- work-packages/m1/10-ci-workflow.md
- docs/DECISIONS.md
- docs/DECISIONS/0001-monorepo-und-workspaces.md
- docs/DECISIONS/0002-uuid-v7-in-der-datenbank.md
- docs/REPO-MAP.md

files-write:

- docs/DECISIONS.md
- docs/DECISIONS/0001-monorepo-with-npm-workspaces.md
- docs/DECISIONS/0002-uuid-v7-as-database-primary-key.md
- docs/REPO-MAP.md

interfaces:

- no code interface; the two ADR file names change, every other reference addresses an
  ADR by number (`ADR-0001`, `ADR-0002`) and stays untouched — only the index links in
  `docs/DECISIONS.md` carry a file name
- `docs/DECISIONS.md`: format note, ADR template and index table
  (`ADR`, `Title`, `Status`) — English
- ADR chapters: `Status`, `Date`, `Stakeholders`, then `Context`, `Decision`,
  `Alternatives`, `Consequences` — the same chapters, the same decisions, the status
  `accepted` and the original dates unchanged

## Task

`docs/DECISIONS.md` and both ADRs are German, which breaks the English rule of
`AGENTS.md`, and the ADR slugs are German as well
(`0001-monorepo-und-workspaces.md`, `0002-uuid-v7-in-der-datenbank.md`). Translate all
three files and rename the two ADRs. No decision changes.

1. `docs/DECISIONS.md`: English rewrite — the format note, the template block
   (`Datum` → `Date`, `Beteiligte` → `Stakeholders`, `Kontext`/`Entscheidung`/
   `Alternativen`/`Konsequenzen` → `Context`/`Decision`/`Alternatives`/`Consequences`)
   and the index table with the new English file names and English titles.
2. `git mv` ADR-0001 to `docs/DECISIONS/0001-monorepo-with-npm-workspaces.md` and
   translate it. Keep the context (PWA, API, source-only shared package without its own
   build step) and the three rejected alternatives (separate repositories,
   pnpm/Turborepo, built shared package with `dist`). Correct the stale consequence
   `npm run check` (Typecheck, Lint, Tests, i18n:check) to the five gates that
   `AGENTS.md` documents now (typecheck, lint, tests, `i18n:check`, `wp:check`).
3. `git mv` ADR-0002 to
   `docs/DECISIONS/0002-uuid-v7-as-database-primary-key.md` and translate it. Every
   technical statement stays: Postgres 16 provides no `uuidv7()` (first in Postgres 18),
   migration `0000_base_tables` creates `gen_uuid_v7()` (48-bit millisecond timestamp,
   version 7, RFC 9562 variant bits, random remainder), `CREATE OR REPLACE` and
   `VOLATILE`, the four rejected alternatives, and the caveat that the ticket timeline
   follows event timestamps and event sequences, not IDs.
4. Headers of both ADRs: `- Status: accepted`, `- Date: 2026-10-28`,
   `- Stakeholders: project responsibility`, plus `API development` for ADR-0002. No new
   ADR, no superseded marker, no added decision text.
5. `docs/REPO-MAP.md`: shorten the WP-M1-10/WP-M1-10c deviation note to the German text
   that is left (the map itself), because the ADR files are English now.
6. Bookkeeping outside `files-write`: a WP-M1-10d entry in the `Changed` section of
   `CHANGELOG.md` and the status note in `work-packages/README.md`.

## Non-goals

- No new ADR, no superseded ADR, no changed decision: translation and slugs only.
- No rewrite of the German `docs/REPO-MAP.md` chapters and module rows (WP-M1-11); only
  its deviation note is adjusted.
- No new index links from `README.md`, `AGENTS.md` or `PLAN.md`; they reference ADRs by
  number and keep doing so.
- No ADR for the QR/PDF renderer or any other future decision.
- No product text change: the emergency notice stays 112 only.

## Acceptance

```bash
npx prettier --check docs/DECISIONS.md docs/DECISIONS
git grep -nI -i -E '\b(und|der|die|das|mit|nicht|bitte|siehe|für|bei|gemäß|Stand|Datum|Beteiligte|Vorlage|Kontext|Entscheidung|Alternativen|Konsequenzen|Sprache|Kapitel|Platzhalter)\b' -- docs/DECISIONS.md docs/DECISIONS
git ls-files docs/DECISIONS
npm run check
```

Expected: Prettier reports no reformat, the German-word grep finds nothing (exit 1),
`git ls-files` lists exactly the two English slugs, and `npm run check` is green
including `wp:check`. The GitHub Actions `check` run of the pushed commit must be green
too — a local run alone is not enough.

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Deviation:
- Follow-up WP:
- Open question:
