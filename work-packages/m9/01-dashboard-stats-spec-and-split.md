# WP-M9-01: dashboard and statistics specification, ADR-0012 and phase-9 split

format: small-model
status: done
depends-on: —
phase: 9
milestone: m9
context-budget: 24k tokens
spec: PLAN.md §13, §16 phase 9, §20 items 8 and 9; specs/11-dashboard.md; specs/12-stats.md
spec-lines: 200

files-read:

- PLAN.md (§5 permissions, §6 data model, §9 timeline, §13 dashboard and statistics, §16 phase 9, §19 open decisions)
- specs/11-dashboard.md (placeholder to replace)
- specs/12-stats.md (placeholder to replace)
- specs/04-oncall.md (§4a.6 coupling reused by the on-call tile)
- specs/05-timeline.md (§5.4 mini timeline reused by "burning now")
- work-packages/m8/01-oncall-spec-and-split.md and docs/WP-TEMPLATE.md (format of a phase split)

files-write:

- specs/11-dashboard.md, specs/12-stats.md
- docs/DECISIONS/0012-dashboard-live-updates-and-statistics.md
- docs/DECISIONS.md
- work-packages/m9/ (WP-M9-02 … WP-M9-18, each file in this commit)

interfaces:

- `specs/11-dashboard.md` — snapshot, fault-free counter and record, tiles, burning-now list, SSE stream, `/tv/:token`, dashboard settings
- `specs/12-stats.md` — filters, reaction times, frequency, top objects and conspicuous flag, compliance, declines, SQL views, API, CSV
- ADR-0012 — SSE probe, plain views, computed record, stored TV token, `tickets.is_test`, inline SVG charts, conspicuous threshold, pauses separate
- `work-packages/m9/` — the phase-9 split in numeric implementation order

## Task

1. Replace the placeholder `specs/11-dashboard.md` and `specs/12-stats.md` with
   the reviewed contract from `PLAN.md` §13: live dashboard, wall display and
   the statistics slices with their API shapes and boundaries.
2. Resolve the implicit phase-9 decisions with ADR-0012: SSE over a five-second
   polling probe, plain SQL views instead of materialized views, a computed
   fault-free record, a stored rotatable TV token, `tickets.is_test` for test
   data, inline SVG charts and `stats.conspicuous_threshold`.
3. Create the phase-9 work packages WP-M9-02 … WP-M9-18 in `work-packages/m9/`
   in numeric order: test flag → views → shared contracts → dashboard service →
   dashboard route → SSE → settings → TV route → statistics services → routes →
   CSV → dashboard UI → statistics UI → TV UI → settings UI → exit criterion.
4. Record the split in `PLAN.md` §16, `work-packages/README.md`,
   `docs/REPO-MAP.md` and `CHANGELOG.md`. Do not write product code in this
   package.

## Non-goals

- No schema, service, route, job, UI or test code.
- No phase-10 API work (API keys, webhooks, CSV import, privacy, restore).
- No notification delivery change: the channel tile reads the existing outbox.
- No materialized view, scheduled report, PDF or e-mail statistics.

## Acceptance

```bash
npm run wp:check
npm run check
```

Expected: `wp:check` green with every new WP file valid; `check` green because
this package changes documentation only. No Docker gate is part of this WP.

## Handoff

- Files changed: the two spec slices, ADR-0012, the decision index, the m9 WP
  files, `PLAN.md` §16, `work-packages/README.md`, `docs/REPO-MAP.md` and
  `CHANGELOG.md`
- Interfaces added: the phase-9 contracts above
- Verified: `npm run wp:check` and `npm run check`
- Follow-up WP: WP-M9-02 … WP-M9-18 (each file exists in this commit)
- Open question: none; the object-type deadline analysis stays undecided in §19
