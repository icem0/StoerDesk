# WP-M21-01: the normalisation of the plan — spec, ADR-0044 and the split

format: small-model
status: done
depends-on: WP-M20-08
phase: 21
milestone: m21
context-budget: 14k tokens
spec: specs/04-oncall.md §4a.3.4
spec-lines: 30

files-read:

- specs/04-oncall.md (§4a.3.3, the duty blocks)
- PLAN.md (§8, the on-call calendar; §16, the phases)
- docs/DECISIONS/0040-the-duty-block-carries-a-weekly-pattern.md
- apps/api/src/oncall/service.ts (the generation of the blocks)
- apps/api/src/oncall/pools.ts (the plan of the pool)

files-write:

- docs/DECISIONS/0044-consecutive-days-form-one-duty-block.md
- docs/DECISIONS.md
- specs/04-oncall.md
- PLAN.md

interfaces:

- ADR-0044 — consecutive days with the same duty window form one block; the
  plan of a pool is normalised where it is read and written
- `mergeOncallBlocks(blocks)` — the shared normalisation (WP-M21-02)

## Task

1. Write ADR-0044: the plan of a pool is normalised, the normalisation never
   changes the duty, it happens where the plan is read and written, an
   ambiguous plan stays as it is, the existing shifts are not touched.
2. Add the rule to `specs/04-oncall.md` as §4a.3.4 and name it in the
   amendment note of §4a.3.2.
3. Add the phase 21 to the roadmap of `PLAN.md` §16 and the rule to §8.
4. Split the phase into WP-M21-02 (the shared normalisation), WP-M21-03 (the
   API) and WP-M21-04 (the administration).

## Non-goals

- No code in this WP (WP-M21-02 to WP-M21-04).
- No migration of the stored plans.
- No change of the shift model.

## Acceptance

```bash
npm run wp:check
```

Expected: green; the four work package files of the phase exist and validate.

## Handoff

- Files changed: the ADR, the decision list, the spec, the plan, this file and
  the three child files
- Interfaces added: ADR-0044
- Verified: `npm run wp:check`
- Follow-up WP: WP-M21-02, WP-M21-03, WP-M21-04 (files exist in this commit)
- Open question: none
