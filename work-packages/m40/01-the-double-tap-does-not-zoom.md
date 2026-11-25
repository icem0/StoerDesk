# WP-M40-01: The double tap does not zoom the page

format: ctx-256k
status: done
depends-on: —
phase: 40
milestone: m40
context-budget: 18k tokens
spec: specs/13-ui.md §14.2; PLAN.md §14, §16, §17
spec-lines: 18
changed-lines: 75

files-read:

- PLAN.md §14, §16, §17
- specs/13-ui.md §14.2
- apps/web/src/styles.css
- apps/web/index.html
- apps/web/src/main.tsx
- work-packages/README.md
- CHANGELOG.md

files-write:

- apps/web/src/styles.css
- apps/web/src/__tests__/touch-zoom.test.ts
- specs/13-ui.md
- PLAN.md
- CHANGELOG.md
- work-packages/README.md
- work-packages/m40/01-the-double-tap-does-not-zoom.md (this document)

interfaces:

- `html` and `body` in `apps/web/src/styles.css` carry `touch-action: manipulation`
- the viewport in `apps/web/index.html` keeps pinch zoom

## Task

1. **The phone behavior.** A double tap on the screen of a phone zooms the page
   into the touched place in Safari; the report form and the ticket list move
   away from the finger that touched them. Add a rule to the global stylesheet:
   `html, body { touch-action: manipulation; }` forbids the double-tap zoom while
   panning and pinch zoom stay available.
2. **The accessibility rule.** The page must not switch the zoom off. The
   viewport keeps pinch zoom, so a reader who needs a bigger type can still zoom
   the page (§14.2, WCAG 1.4.4).
3. **The test.** Prove that the stylesheet contains `touch-action: manipulation`,
   that it does not use `touch-action: none`, `pan-x` or `pan-y` for the global
   body rule, and that the viewport in `index.html` does not contain
   `user-scalable=no` or a `maximum-scale` below 1.
4. **The docs.** Add the rule to `PLAN.md` §14 and the phase 40 entry to §16,
   add the phase and WP rows in `work-packages/README.md` and the changelog
   entry in `CHANGELOG.md`.

## Non-goals

- No viewport zoom restriction and no zoom lock.
- No per-page touch-action rules beyond the global rule.
- No gesture library, no browser detection and no user setting.
- No change of the report form or of the layout.

## Acceptance

```bash
npm run check:static
npx vitest run apps/web/src/__tests__/touch-zoom.test.ts
npm run check
```

Expected result: all green; the new case fails before the stylesheet rule and
passes after it. The full check may report an unrelated local scratch test as a
gate failure if it is present in the working tree; that file is outside this WP.

## Handoff

- Files changed: the global stylesheet and the global web test
- Interfaces added: the global `touch-action: manipulation` rule on `html` and
  `body`
- Verified: `npm run check:static` and the targeted vitest case
- Follow-up WP: none — phase 40 is closed
- Open question: none
