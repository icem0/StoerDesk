# WP-M27-06: the criterion of the phase

format: ctx-256k
status: done
depends-on: WP-M27-05
phase: 27
milestone: m27
context-budget: 32k tokens
spec: specs/08-objects-api.md §9.3, ADR-0050, PLAN.md §16 (phase 27)
spec-lines: 160
changed-lines: 260

files-read:

- specs/08-objects-api.md §9.3 (the print of the sheet and the notice)
- docs/DECISIONS/0050-the-sticker-is-a-template.md (the decision)
- apps/web/e2e/report-flow.spec.ts (the harness of a Playwright probe)
- apps/web/e2e/auth.spec.ts (the sign-in of the probe)
- apps/web/src/features/objects/sticker-sheet.tsx (the sheet and its page rule)
- apps/web/src/features/objects/sticker-page.tsx (the select of the sheet)
- apps/web/src/i18n/locales/de/object.json (the texts of the namespace `object`)
- work-packages/README.md (the backlog of record)

files-write:

- apps/web/e2e/sticker-print.spec.ts
- work-packages/m27/06-the-criterion-of-the-phase.md
- work-packages/README.md
- PLAN.md
- docs/REPO-MAP.md
- CHANGELOG.md

interfaces:

- `apps/web/e2e/sticker-print.spec.ts` — the criterion of the phase: every sheet of the catalog prints in its own grid, every label carries the 112 notice

## Task

The phase promised a criterion: every sheet of the catalog prints in its own
grid, every label carries the 112 notice, and the administration decides the
geometry and the look of the sticker. The unit tests prove the model; this
package proves the print in the browser.

1. **The probe** `apps/web/e2e/sticker-print.spec.ts`: it signs in as the
   administrator (German and English), creates an object through the running
   stack, opens `/objects/stickers` and proves
   - that **every label** of the sheet carries the 112 notice in the language of
     the browser,
   - that the sheet of the job decides the **grid**: the label of the sheet with
     104 labels measures 25,7 × 20,7 mm in the browser (a millimetre is
     96/25.4 CSS pixels), and
   - that the sheet writes its own **page rule** (`@page { size: A4; margin: 0; }`).
2. **The plan** `PLAN.md` §16: the phase 27 is closed with its criterion, and the
   packages of the phase are named.
3. **The bookkeeping**: the backlog of record, the module map and the changelog.

## Non-goals

- No change of the print view, of the sheet or of the administration — the
  criterion proves what the packages before it built.
- No PDF endpoint and no print-dialog automation.
- No logo on the sticker and no copies per object.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
npm run test:e2e
```

Expected: all green; the probe fails before the sheet prints from the geometry
and passes after it.

## Handoff

- Files changed: the six files above
- Interfaces added: the criterion of the phase
- Verified: `npm run check` green (typecheck, lint, the tests of the web and the
  API, i18n, wp-check and the Playwright suite with the new probe: 15 cases,
  among them the sheet of the stickers in German and English)
- Follow-up WP: none — the label roll of the office decides the numbers of the
  presets, and the free grid takes every other measure over without a new
  version of the app
- Open question: the measures of the presets are proposals for the label roll of
  the office
