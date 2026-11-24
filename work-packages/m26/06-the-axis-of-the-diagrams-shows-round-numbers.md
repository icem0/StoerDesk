# WP-M26-06: the axis of the diagrams shows round numbers

format: ctx-256k
status: done
depends-on: WP-M26-05
phase: 26
milestone: m26
context-budget: 40k tokens
spec: specs/12-stats.md §12.10; ADR-0049 (decision 3)
spec-lines: 40
changed-lines: 120

files-read:

- apps/web/src/features/stats/charts.tsx (the diagrams of the trends)
- apps/web/src/features/stats/stats-page.tsx (the page of the statistics)
- apps/web/src/lib/duration.ts (the formatting of a duration)
- apps/web/src/i18n/locales/de/stats.json (the texts of the statistics)

files-write:

- apps/web/src/features/stats/charts.tsx
- apps/web/src/features/stats/stats-page.tsx
- apps/web/src/features/stats/__tests__/charts.test.tsx
- work-packages/m26/

interfaces:

- `LineChart` — the diagram of a series over the buckets with a round axis
- `BarChart` — the diagram of the count per bucket with a round axis

## Task

The axis of the diagrams of **WP-M26-04** and **WP-M26-05** carried the
rounded gridlines of a fixed number of steps: a value of five produced the
scale 0, 2, 3, 5, and a duration of five hours produced 0 min, 1,7 h, 3,3 h,
5 h — numbers that no reader can compare at a glance.

1. **The scale** `apps/web/src/features/stats/charts.tsx`: the step of the
   axis is a round number (1, 2, 2.5 or 5 times a power of ten), and the
   number of the steps varies — three, four or five. The scale with the
   smallest headroom wins, so the axis of a value of five runs from 0 to 5 in
   steps of one and the axis of ninety from 0 to 90 in steps of thirty.
2. **The unit** `apps/web/src/features/stats/stats-page.tsx`: from an hour on
   the values of the diagrams are hours, so the axis shows 0 h, 2 h, 4 h and
   not 0 min, 1,7 h, 3,3 h. A diagram without any value shows the text of
   the empty period instead of an empty frame.
3. **The test** `apps/web/src/features/stats/__tests__/charts.test.tsx` proves
   the scale of the axis, the tooltip of a point and the gap without a value.

## Non-goals

- No change of the answer of the API — the diagrams draw what the API answers.
- No new diagram and no new text.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new test of the diagrams fails before the change and
passes after it.

## Handoff

- Files changed: the diagrams, the page and the new test of the diagrams
- Interfaces added: none
- Verified: the commands above
- Follow-up WP: none
- Open question: none
