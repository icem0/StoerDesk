# WP-M1-10e: Follow-up closure rule and open backlog

format: small-model
status: implemented
depends-on: WP-M1-10c
phase: 1
context-budget: 16k tokens
spec: PLAN.md §0 (reading order), §16 (phase exit criteria), §17 (split rule and handoff fields); AGENTS.md "Work package size (small models)" and "CI after push"; `specs/15-work-packages.md` is still a placeholder, so `PLAN.md` and `AGENTS.md` are authoritative
spec-lines: 0

files-read:

- PLAN.md
- AGENTS.md
- docs/WP-TEMPLATE.md
- scripts/wp-check.mjs
- work-packages/README.md
- work-packages/m1/09-admin-users-roles-ui.md

files-write:

- AGENTS.md
- PLAN.md
- docs/WP-TEMPLATE.md
- work-packages/README.md

interfaces:

- no code interface; `scripts/wp-check.mjs` and `npm run wp:check` stay unchanged
- `AGENTS.md` gains the section **Open follow-ups (mandatory closure)** between
  "Work package size (small models)" and "Versioning"
- `PLAN.md` §16 gains the subsection **Current state and open backlog**, which makes
  the reading-order claim of §13 true
- `work-packages/README.md` gains an **Open follow-ups** table below the status prose
- `docs/WP-TEMPLATE.md` gains the `status:` metadata field and the split-child rule

## Task

Split follow-ups are currently only prose in the `## Handoff` line
`Follow-up WP:` and in the status paragraph of `work-packages/README.md`. Nothing
forces them to be finished, so WP-M1-09b–WP-M1-09d were overtaken by WP-M1-10,
WP-M1-10b and WP-M1-10c. Close that hole with governance text only.

1. `AGENTS.md`: add the section **Open follow-ups (mandatory closure)** with four
   rules — (a) a split creates the child WP files in the same commit as the parent,
   a `Follow-up WP:` line alone is not a work package; (b) before starting a WP run
   `git grep -n "Follow-up WP:\|Open question:" -- work-packages/<phase>/` and report
   the open items; (c) the open items of the running phase are implemented in
   numeric order before the next phase starts, and a phase is closed only when every
   follow-up of that phase is implemented or explicitly cancelled with a reason in
   the parent WP; (d) an announced follow-up without a WP file is a defect, not a
   backlog entry.
2. `PLAN.md` §16: after the phase table add the subsection **Current state and open
   backlog** — Phase 0 done, Phase 1 through WP-M1-10c implemented, plus the phase 1
   backlog list (WP-M1-10f, WP-M1-09b, WP-M1-09c, WP-M1-09d, WP-M1-09e login form UI,
   WP-M1-10d, WP-M1-11, WP-M1-12) with one line each, and the note that the phase 1
   exit criterion "login as admin works" needs the login form UI of WP-M1-09e.
3. `work-packages/README.md`: after the status block add the table
   `Open follow-ups` with the columns WP, content, status, and the WP-M1-09b–09d,
   WP-M1-09e, WP-M1-10d, WP-M1-10f rows; state that the table is the machine-readable
   backlog and the prose above is history only.
4. `docs/WP-TEMPLATE.md`: add `status: planned | in-progress | implemented | cancelled`
   next to the other metadata and a `Handoff` line stating that a split lists the
   child WP files that were created in the same commit.

## Non-goals

- No change to `scripts/wp-check.mjs` and no new lint or CI gate — the rule is text.
- No WP documents for WP-M1-09b–09d, WP-M1-09e, WP-M1-10d and WP-M1-10f; each one is
  written in its own commit.
- No CI, workflow or image changes (WP-M1-10f).
- No implementation of any backlog item in this WP.

## Acceptance

```bash
npx prettier --check AGENTS.md PLAN.md docs/WP-TEMPLATE.md work-packages/README.md
npm run check
```

Expected: Prettier reports no reformat, `npm run check` is green including
`wp:check`, and the GitHub Actions `check` run of the pushed commit is green.

## Handoff

- Files changed: the four governance files above, plus `CHANGELOG.md` and
  `docs/REPO-MAP.md` as bookkeeping outside `files-write`
- Interfaces added: none (governance text only)
- Verified: `npm run check` green — 16 files, 104 tests, `i18n:check ok`,
  `wp:check: 17 small-model WP checked, 0 failed, 16 legacy skipped`; Prettier reports
  no reformat for every changed Markdown file
- Follow-up WP: WP-M1-10f (traceable CI run and job names), then WP-M1-09b, WP-M1-09c,
  WP-M1-09d, WP-M1-09e, WP-M1-10d, WP-M1-11, WP-M1-12
- Open question: none
