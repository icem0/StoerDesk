# WP-M8-01: on-call specification, ADR-0011 and phase-8 split

format: small-model
status: done
depends-on: —
phase: 8
milestone: m8
context-budget: 20k tokens
spec: PLAN.md §8, §16 phase 8, §19; specs/04-oncall.md; specs/09-offline.md §9.6
spec-lines: 200

files-read:

- PLAN.md (§8 On-call calendar, §16 phase 8, §17 work-package limits, §19 open decisions)
- specs/04-oncall.md (placeholder to replace)
- specs/02-data-model.md (§4.2, §4.12 tables of later phases)
- specs/09-offline.md (§9.6 on-call confirm/decline stays out of phase 5)
- docs/WP-TEMPLATE.md and work-packages/m6/01-timeline-escalation-spec-and-split.md
- docs/DECISIONS.md (index and ADR format)

files-write:

- specs/04-oncall.md
- docs/DECISIONS/0011-oncall-slot-model-and-swap-approval.md
- docs/DECISIONS.md
- work-packages/m8/ (WP-M8-02 … WP-M8-16, each file created in this commit)

interfaces:

- `specs/04-oncall.md` — settings, pools, shifts, slots, confirm/decline, swaps, coupling, iCal
- ADR-0011 — local wall-clock weeks, swap approval default, group membership, default pool, iCal token
- `work-packages/m8/` — the phase-8 split in numeric implementation order

## Task

1. Replace the placeholder `specs/04-oncall.md` with the reviewed contract from
   `PLAN.md` §8: settings, pool and shift tables, the six states and their
   transitions, DST-safe weekly slots, confirm/decline, swap approval, ticket
   coupling, the personal iCal feed and the API summary.
2. Resolve the open decision "whether shift swaps require admin approval by
   default" with ADR-0011: default `true`, the first acceptance stays atomic and
   the original technician remains responsible until approval.
3. Decide the remaining implicit points in ADR-0011: local wall-clock weeks in
   `Europe/Berlin`, group-based pool membership, `oncall.default_pool_id`, and
   the stateless HMAC token of the iCal feed.
4. Create the phase-8 work packages WP-M8-02 … WP-M8-16 in `work-packages/m8/`
   in numeric order (schema → slot math → pools → planning → routes →
   confirm/decline → swaps → coupling → offer timeout → iCal → UI → offline →
   exit criterion).
5. Record the split in `PLAN.md` §16, `work-packages/README.md` and
   `CHANGELOG.md`. Do not write product code in this package.

## Non-goals

- No schema, service, route, job, UI or test code.
- No notification delivery: coupling sets the target only (phase 7 stays as is).
- No dashboard tile or statistics (phase 9).
- No change to `specs/02-data-model.md` beyond the existing §4.12 pointer.

## Acceptance

```bash
npm run wp:check
npm run check
```

Expected: `wp:check` green with every new WP file valid; `check` green because
this package changes documentation only. No Docker gate is part of this WP.

## Handoff

- Files changed: the on-call slice, ADR-0011, the decision index, the m8 WP
  files, `PLAN.md` §16, `work-packages/README.md` and `CHANGELOG.md`
- Interfaces added: the phase-8 contracts above
- Verified: `npm run wp:check` and `npm run check`
- Follow-up WP: WP-M8-02 … WP-M8-16 (each file exists in this commit)
- Open question: none
