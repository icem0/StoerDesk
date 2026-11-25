# WP-M36-08: the interface reads itself one step bigger

format: ctx-256k
status: planned
depends-on: WP-M36-03, WP-M36-04, WP-M36-05, WP-M36-06, WP-M36-07
phase: 36
milestone: m36
context-budget: 54k tokens
spec: specs/13-ui.md §14.2, §14.6, §14.13; PLAN.md §14
spec-lines: 200
changed-lines: 260

files-read:

- specs/13-ui.md (§14.2 accessibility, §14.6 the shell on a phone, §14.13)
- docs/DECISIONS/0060-an-explanation-of-a-place-is-a-help-popover.md
- apps/web/src/styles.css
- apps/web/src/components/Shell.tsx
- apps/web/src/components/notification-bell.tsx
- apps/web/src/features/stats/charts.tsx
- apps/web/src/features/oncall/readiness-calendar.tsx
- apps/web/src/features/tickets/ticket-timeline.tsx
- apps/web/src/e2e/report-form.spec.ts

files-write:

- apps/web/src/styles.css (the root font size, the meta text)
- apps/web/src/components/Shell.tsx (the version badge)
- apps/web/src/components/notification-bell.tsx (the badge of the unread messages)
- apps/web/src/features/stats/charts.tsx (the labels of the axis)
- apps/web/src/features/oncall/readiness-calendar.tsx (the labels of the grid)
- apps/web/src/features/tickets/ticket-timeline.tsx (the labels of the milestones)
- apps/web/src/features/tickets/ticket-detail-page.tsx (the labels of the action bar)

interfaces:

- `:root { font-size: 17px }` in `styles.css` — the one lever of the type scale; every rem-based Tailwind size and every touch target grow together
- the 11 hard `text-[10px]`/`text-[11px]` classes move to rem classes (`text-2xs` or a `@theme` step)
- the meta text of the menu and of the hints moves from `text-slate-500` to `text-slate-300`

## Task

„lieber den text etwas grösser weil lesbarer“ — without 1250 class edits and
without breaking §14.2.

1. **One lever.** `apps/web/src/styles.css` sets the root font size once (17 px,
   the step from 16 px). Tailwind sizes are rem-based, so the whole scale grows
   ~6 % — and every touch target grows with it (44 px → 46.75 px), so §14.2
   stays satisfied instead of being re-proven file by file.
2. **The exceptions move to the scale.** The 11 hard `text-[10px]`/`text-[11px]`
   classes (version badge, unread badge, axis labels, the labels of the readiness
   grid, of the milestones and of the action bar) become rem classes, so they
   grow too and stay legible on a phone.
3. **Size and contrast move together.** The meta text of the menu and of the
   hints leaves `text-slate-500` and takes `text-slate-300` (dark theme) and the
   matching step of the light theme under `.theme-light` — AA contrast (§14.2) is
   a requirement, so a bigger text that failed AA is not done.
4. **The print stays print.** The sticker rules keep their mm values, the root
   size never scales the sheet (§2, WP-M27-01 … WP-M27-06).
5. **The gates.** `npm run test:e2e` runs the report form on a 375×667 viewport:
   the form stays one-hand usable, the 112 notice stays visible and the
   interactive rule of §15.4 (2 s on a mid-range phone) stays provable. Locally
   the run is skipped — then it is reported as **unverified**, never as green.

## Non-goals

- No new theme and no new colour.
- No change of the accent ramp (ADR-0036) and of the semantic colours.
- No change of the sticker geometry or of the sticker fonts in mm (ADR-0050).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
npm run build
npm run test:e2e
```

Expected: all green; where the E2E job skipped because no database or no browser
is available, it is reported as unverified.

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: none — phase 36 is closed when WP-M36-02 … WP-M36-08 are done and the phase 36 acceptance test names the mechanism, the two tiers, the page-level ⓘ and the type scale
- Open question: none
