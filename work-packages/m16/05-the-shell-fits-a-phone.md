# WP-M16-05: the shell fits a phone

format: small-model
status: done
depends-on: WP-M16-04
phase: 16
milestone: m16
context-budget: 18k tokens
spec: specs/13-ui.md §14.6; PLAN.md §14 (mobile-first, 44 px), §16 phase 16
spec-lines: 60

files-read:

- apps/web/src/components/Shell.tsx (the header rows, the nav, the safe areas)
- apps/web/src/styles.css (the mobile table rule, the theme classes)
- apps/web/src/components/__tests__/shell.test.tsx (the shell assertions)
- specs/13-ui.md (§14.6)

files-write:

- apps/web/src/components/Shell.tsx
- apps/web/src/styles.css
- apps/web/src/components/__tests__/shell.test.tsx
- PLAN.md (§16 record of phase 16)

interfaces:

- the header of a phone keeps two rows: identity and actions above, the tab
  strip below
- the tab strip scrolls horizontally only, its entries are at least 44 px high
  and reach the edge of the screen
- the safe areas of a notch stay respected at the left, the right and the bottom

## Task

1. The identity row of a phone becomes compact: a smaller logo and a smaller
   title, so the row of the version, the gear and the menu no longer needs
   three lines on a 390 px wide screen.
2. The tab strip gains `overscroll-y-none` and a min-height of 44 px per entry,
   and its negative margin plus compensating padding reach the edge of the
   screen, so a thumb taps the strip itself and never slides the strip
   vertically inside the header.
3. The shell respects the safe areas: the root keeps the inset of a notch left
   and right, `main` keeps the inset at the bottom, so no label sits in the
   rounded corner of a phone.
4. `styles.css` names the rule for the tab strip (the momentum of the
   horizontal scroll next to the existing momentum of the table scroll) and the
   shell test asserts the classes of the strip and the insets of the shell, so
   the phase-16 exit criterion is stated where it is testable.
5. `PLAN.md` §16 records the closed phase: the administration paints the whole
   interface with one saved colour, the bell sits in the menu next to the
   readiness and the shell fits a phone.

## Non-goals

- No new breakpoint and no second stylesheet: the classes of the shell and the
  rules of `styles.css` carry the mobile view.
- No change of the ticket detail action bar, of the report form or of the
  sticker sheets.
- No Playwright viewport test in this package; the E2E suite of the phases
  before stays the interaction proof.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
npm run build
```

Expected: all green; the new assertions fail before the change and pass after it.

## Handoff

- Files changed: `apps/web/src/components/Shell.tsx`, `apps/web/src/styles.css`,
  `apps/web/src/components/__tests__/shell.test.tsx`, `PLAN.md` §16
- Interfaces added: the marker class `shell-tab-strip` of the header menu, the safe-area
  insets of the shell root and of the content, the compact identity row of a phone
- Verified: `npm run typecheck`, `npm run lint`, `npm run test:run`, `npm run wp:check`,
  `npm run build`
- Follow-up WP: none — phase 16 is closed
- Open question: none
