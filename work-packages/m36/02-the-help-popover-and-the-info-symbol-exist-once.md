# WP-M36-02: the help popover and the info symbol exist once

format: ctx-256k
status: done
depends-on: WP-M36-01
phase: 36
milestone: m36
context-budget: 52k tokens
spec: specs/13-ui.md §14.2, §14.13; PLAN.md §3.1, §14
spec-lines: 180
changed-lines: 420

files-read:

- specs/13-ui.md (§14.2 accessibility, §14.13 the explanation of a place)
- docs/DECISIONS/0060-an-explanation-of-a-place-is-a-help-popover.md
- apps/web/src/components/icon.tsx
- apps/web/src/components/row-menu.tsx (the portal of the `position: fixed` menu)
- apps/web/src/components/notification-bell.tsx
- apps/web/src/i18n/index.ts
- apps/web/src/styles.css

files-write:

- apps/web/src/components/help-popover.tsx
- apps/web/src/components/icon.tsx (the name `info` and its symbol)
- apps/web/src/i18n/index.ts (the namespace `help`)
- apps/web/src/i18n/locales/de/help.json
- apps/web/src/i18n/locales/en/help.json
- apps/web/src/components/__tests__/help-popover.test.tsx

interfaces:

- `HelpPopover({ text, label?, className? })` — a `<button>` with the info symbol that toggles an anchored panel
- `IconName` gains `info` — the info symbol of the house (feather stroke 1.8 px, `currentColor`, `aria-hidden`)
- the namespace `help` with `help.<surface>.<item>` (summary) and `help.<surface>.<item>More` (panel body)

## Task

One mechanism for every explanation of the interface, so the later packages
have nothing to invent.

1. **`apps/web/src/components/icon.tsx`** gains the name `info` in the typed
   union `IconName` and its hand-written inline SVG (a circle with the letter
   `i`, feather stroke 1.8 px, `currentColor`, `aria-hidden`) — the symbol of
   the house, not a glyph of a font.
2. **`apps/web/src/components/help-popover.tsx`**: a real `<button type="button">`
   that carries the info symbol, is at least 44 px high, paints the accent focus
   ring on `focus-visible` and toggles a panel. The panel hangs in the body of
   the document with the portal pattern of `row-menu.tsx` (`createPortal`,
   `position: fixed`), so no sticky header and no scroll container clips it; it
   opens upwards when there is no room below and follows the trigger while the
   page scrolls. `aria-expanded` names the state, the panel is
   `aria-labelledby` by the trigger. The panel closes on a second click, on a
   click outside and on `Escape` — **never on a timer** and never on a CSS
   `:hover`. It respects `prefers-reduced-motion`.
3. **The namespace `help`**: `apps/web/src/i18n/index.ts` registers `help`, the
   two locale files exist with the keys of the surfaces this phase explains.
   Every key exists in `de` and in `en` — `npm run i18n:check` proves it.
4. **The panel wears the utilities of the house.** The slate scale is remapped
   by the theme (`styles.css`, `.theme-light`), so the panel follows the light
   and the dark mode without a rule of its own — no rule of the stylesheet is
   needed for the panel.
5. **The test**: the button is a `<button>` with `aria-expanded`, the panel
   exists in the DOM **after** the click and not before it, the panel is
   reachable by keyboard (`Enter` opens, `Escape` closes), the trigger is at
   least 44 px, and no `title=` carries the explanation.

## Non-goals

- No settings menu and no page-level ⓘ — those surfaces are WP-M36-03 and
  WP-M36-04; the migration of the existing tooltips is WP-M36-05 … WP-M36-07.
- No change of `row-menu.tsx`: the menu of the actions of a row already exists
  and stays its own component.
- No new dependency, no tooltip library.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new test fails before the component exists and passes
after it.

## Handoff

- Files changed: `apps/web/src/components/help-popover.tsx` (new),
  `apps/web/src/components/icon.tsx` (the name `info`),
  `apps/web/src/i18n/index.ts` (the namespace `help`),
  `apps/web/src/i18n/locales/de/help.json` and `.../en/help.json` (new),
  `apps/web/src/components/__tests__/help-popover.test.tsx` (new)
- Interfaces added: `HelpPopover({ text, label?, className? })`, `IconName` +
  `info`, the namespace `help` with `help.trigger` and `help.triggerOpen`
- Verified: `npm run check:static` (typecheck, eslint 0 errors, `i18n:check`,
  `wp:check`), the 7 cases of the new test
- Follow-up WP: WP-M36-03 (the entry of the settings menu)
- Open question: none
- Notes: the panel follows the theme through the remapped slate scale, so the
  stylesheet needed no rule; the panel is a `role="note"`, labelled by its
  trigger, and it closes on a second click, on a click beside it and on
  `Escape` — never on a timer.
