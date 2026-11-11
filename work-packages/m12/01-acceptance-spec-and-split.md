# WP-M12-01: Acceptance criteria — slice mirrored from PLAN.md §20 and phase-12 split

format: small-model
status: implemented
depends-on: WP-M11-12
phase: 12
milestone: m12
context-budget: 20k tokens
spec: PLAN.md §16 phase roadmap, §17 work-package rules, §20 acceptance summary; specs/16-acceptance.md
spec-lines: 134

files-read:

- PLAN.md (§16 current state, §17 limits, §18 gates, §20 acceptance summary)
- specs/16-acceptance.md (the current placeholder)
- specs/14-nfr.md (a slice mirrored from PLAN.md — header and mirror-note style)
- work-packages/m11/12-internal-report-time-future-translation.md (small-model format)
- docs/REPO-MAP.md (the implemented surfaces named by the mapping)
- docs/WP-TEMPLATE.md

files-write:

- specs/16-acceptance.md (placeholder replaced)
- work-packages/m12/ (WP-M12-01 … WP-M12-02, each file in this commit)
- work-packages/README.md, CHANGELOG.md (backlog rows, phase row and one docs entry —
  bookkeeping of the same commit)

interfaces:

- `specs/16-acceptance.md` §16.1 — acceptance items 1–12 mirrored from `PLAN.md` §20
- `specs/16-acceptance.md` §16.2 — item → implemented-surface mapping (documents only)
- `specs/16-acceptance.md` §16.3 — verification state and the phase-12 split
- `work-packages/m12/` — the phase-12 packages in numeric implementation order

## Task

1. Replace the placeholder content of `specs/16-acceptance.md`: the original book
   chapters 18 + 19 were not supplied, so mirror `PLAN.md` §20 (items 1–12) as
   reviewable content — state the mirror at the top, keep the header labels
   (**Kapitel:** 18 + 19, **Umfang:** ~180 Zeilen), quote and structure §20, do not
   invent or extend a criterion.
2. Add the mapping section: how every item maps to already-implemented surfaces
   (QR report path, offline flight mode, offer claim, decline, acknowledge,
   escalation, object API, dashboard counter, statistics, notification fallback,
   PWA push, on-call calendar) — every name must exist in `docs/REPO-MAP.md`, no
   new feature may be claimed; where an item is only partially covered (item 11,
   push registration unimplemented), say so and name it unverified, never green.
3. Mark the slice "mirrored from `PLAN.md` §20 and reviewed for WP-M12-01".
4. Announce and create the phase-12 split in `work-packages/m12/` in this commit:
   this document and WP-M12-02 "acceptance end-to-end suite for items 1–12"
   (`02-acceptance-e2e-suite.md`, planned, naming `scripts/e2e-acceptance.mjs` which
   reuses the helpers of `scripts/e2e-check.mjs` and the existing test flags).
5. Bookkeeping in the same commit: phase row `m12` and the backlog rows WP-M12-01
   (done) / WP-M12-02 (planned) in `work-packages/README.md`, minimal status prose,
   one `docs` entry in `CHANGELOG.md`. No product code in this package.

## Non-goals

- No schema, service, route, job, UI, script or test code — `scripts/e2e-acceptance.mjs`
  is announced, not created.
- No change to `PLAN.md` §20, `specs/README.md` or any other slice.
- No new acceptance criterion and no new feature claim.
- No phase-11 work, no push, no release work.

## Acceptance

```bash
npm run wp:check
npm run check
git grep -n "WP-M12" -- work-packages/
```

Expected: `wp:check` green with both new WP documents valid; `check` green because
this package changes documentation only — the E2E gate reports skipped/UNVERIFIED
without a browser or database in this container, never a weakening. The grep shows
both `m12` documents and their backlog rows.

## Handoff

- Files changed: `specs/16-acceptance.md` (placeholder replaced), `work-packages/m12/01-…`
  and `work-packages/m12/02-…` (both created in this commit), `work-packages/README.md`
  (phase row, two backlog rows, status prose), `CHANGELOG.md` (one docs entry)
- Interfaces added: none in code — the slice contracts §16.1–§16.3 of
  `specs/16-acceptance.md`
- Verified: `npm run wp:check` and `npm run check` (see the commit run: E2E
  reported UNVERIFIED without Chromium/database)
- Follow-up WP: WP-M12-02 — acceptance end-to-end suite for items 1–12
  (its file `work-packages/m12/02-acceptance-e2e-suite.md` exists in this commit)
- Open question: none
