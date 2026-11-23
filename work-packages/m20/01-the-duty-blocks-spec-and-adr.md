# WP-M20-01: the duty blocks — the spec and ADR-0040

format: small-model
status: done
depends-on: —
phase: 20
milestone: m20
context-budget: 10k tokens
spec: PLAN.md §8, §16 phase 20; specs/04-oncall.md §4a.3.2, §4a.3.3
spec-lines: 80

files-read:

- specs/04-oncall.md (§4a.3.2, §4a.4, §4a.6, §4a.7)
- docs/DECISIONS/0035-the-readiness-knows-a-duty-window-per-weekday.md
- docs/DECISIONS.md (the index)
- PLAN.md (§8 duty windows, §16 phase roadmap)

files-write:

- specs/04-oncall.md (§4a.3.2 amended, §4a.3.3 added)
- docs/DECISIONS/0040-the-duty-block-carries-a-weekly-pattern.md
- docs/DECISIONS/0035-the-readiness-knows-a-duty-window-per-weekday.md (status line)
- docs/DECISIONS.md (index row)

interfaces:

- `duty block` — `from_weekday`, `to_weekday`, `start`, `end` (ADR-0040)
- shift pattern — `weekdays`, `daily_start`, `daily_end` on one shift
- `specs/04-oncall.md` §4a.3.3 — the target model

## Task

1. Write ADR-0040: a block spans consecutive weekdays, one shift per block per
   week, blocks replace the day windows of a pool, one technician per block.
2. Amend ADR-0035 (decisions 2 and 3) in its status line.
3. Add §4a.3.3 to the spec and mark §4a.3.2 as amended.
4. Create WP-M20-02 … WP-M20-06 and the phase-20 row in `PLAN.md` §16 and in
   `work-packages/README.md`; record the change in `CHANGELOG.md`.

## Non-goals

- No schema, service, route, UI or test code.
- No change of existing shifts (§4a.9).
- No per-day swap inside a block (ADR-0040 decision 4).

## Acceptance

```bash
npm run wp:check
npm run check
```

Expected: `wp:check` green; `check` green (documentation only).

## Handoff

- Files changed: ADR-0040, ADR-0035 status, the decision index, `specs/04-oncall.md`
  §4a.3.2–§4a.3.3, the m20 WP files, `PLAN.md` §16, `work-packages/README.md`,
  `CHANGELOG.md`
- Interfaces added: the contracts above
- Verified: the commands above
- Follow-up WP: WP-M20-02 … WP-M20-08 (files exist in this commit; the phase was
  split further in WP-M20-02, because the pool contract and the administration
  that reads it belong to one commit)
- Open question: the three decisions of the office are taken with the defaults of
  ADR-0040 (technician block 00:00–24:00 possible, one technician per block,
  blocks replace the day windows); the office confirms them before WP-M20-03
