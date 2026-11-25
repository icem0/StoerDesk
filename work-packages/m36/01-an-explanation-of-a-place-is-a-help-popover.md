# WP-M36-01: an explanation of a place is a help popover

format: ctx-256k
status: done
depends-on: WP-M29-03 (the one-column menu of the settings), WP-M16-05 (the shell on a phone), WP-M26-01 (the statistics read themselves)
phase: 36
milestone: m36
context-budget: 58k tokens
spec: specs/13-ui.md §14.2, §14.3, §14.10, §14.13 (new); PLAN.md §14, §16, §17
spec-lines: 340
changed-lines: 380

files-read:

- PLAN.md (§14 the interface, §16 the current state, §17 the profiles)
- specs/13-ui.md (§14.2 accessibility, §14.3 the shell, §14.10 the menu of the settings)
- docs/REPO-MAP.md (the rows of the shell, of the settings menu, of the icon set)
- docs/DECISIONS.md (the index of the decisions)
- docs/WP-TEMPLATE-256k.md
- apps/web/src/components/Shell.tsx
- apps/web/src/components/icon.tsx
- apps/web/src/components/row-menu.tsx
- apps/web/src/settings/settings-menu.tsx
- apps/web/src/settings/settings-page.tsx
- apps/web/src/styles.css
- apps/web/src/i18n/index.ts

files-write:

- specs/13-ui.md (§14.13 the explanation of a place)
- docs/DECISIONS/0060-an-explanation-of-a-place-is-a-help-popover.md
- work-packages/m36/01-an-explanation-of-a-place-is-a-help-popover.md (this document)
- work-packages/m36/02-the-help-popover-and-the-info-symbol-exist-once.md
- work-packages/m36/03-an-entry-of-the-settings-menu-shows-its-name-alone.md
- work-packages/m36/04-every-guarded-page-names-itself-with-one-info-symbol.md
- work-packages/m36/05-the-administration-names-its-keys-and-its-blocks-in-a-panel.md
- work-packages/m36/06-the-readiness-and-the-tickets-name-their-marks-in-a-panel.md
- work-packages/m36/07-the-statistics-the-objects-and-the-notification-cards-name-their-marks-in-a-panel.md
- work-packages/m36/08-the-interface-reads-itself-one-step-bigger.md

interfaces:

- `HelpPopover({ triggerText, panelText, className? })` — the one trigger of every explanation
- `IconName` gains `info` — the info symbol of the house
- `help.<surface>.<item>` (summary) and `help.<surface>.<item>More` (panel body) in the new namespace `help`
- `PageHelp` — the map `route → help.page.<route>`, and the routes that explain themselves

## Task

The office asked for three things at once: „die Erklärungen sollen alle in ein
mouseover gepackt werden falls sie im Menü sind“, „bei Erklárungen auf einer
Seite ohne einen link … soll ein info symbol sein … auf jeder Seite“, „lieber
den text etwas grösser weil lesbarer“ — and the exception „es sei denn es ist
perse eine info seite oder hilfe seite“. The interface today explains itself in
four unrelated ways (135 visible hint paragraphs, 27 native `title=` tooltips,
three `<details>` blocks, two `aria-describedby` paragraphs). No code in this
package — the scope, the decision and the plan of the phase.

1. **ADR-0060** and its index row: an explanation of a place is a **help
   popover** — a real button with the info symbol that toggles a panel at the
   place. A hover-only tooltip cannot be the answer, because the app is a
   mobile-first PWA: a `title=` does not exist on a touch, cannot be opened by
   a keyboard, cannot be zoomed and closes on a timer (§14.2).
2. **`specs/13-ui.md` §14.13** — the mechanism (one component, the panel in the
   DOM, no timer), the two tiers of one explanation (`help.<surface>.<item>`
   summary visible, `…More` the panel body), the three surfaces that consume it
   (settings menu entry, the page-level ⓘ of the shell, the fields of a form),
   the surfaces that get **no** symbol (the header menu, a page that explains
   itself), the rules that never move behind a symbol (the 112 notice, the
   report form, the action bar, the bands, the mandatory badges, the reason of
   a blocked action, the sections of the settings menu), the rule that
   `title=` is no content carrier, and the one lever of the type scale.
3. **`PLAN.md` §14** carries the bullet of the rule, **§16** names the phase and
   its exit criterion.
4. **The work packages of the phase** — the mechanism (WP-M36-02), the settings
   menu entry (WP-M36-03), the page-level ⓘ of the shell (WP-M36-04), the
   migration of the 27 `title=` sites in three packages by surface
   (WP-M36-05 … WP-M36-07) and the readability of the interface (WP-M36-08).

## Non-goals

- No component, no CSS and no text in this package — everything follows in
  WP-M36-02 … WP-M36-08.
- No change of a rule that already stands: the 112 notice (§2), the menu of the
  settings that never folds away (§14.10, WP-M29-03), the order of the ticket
  list (§14.9).
- No instance-editable page help: the help of a page is a fact of the build, the
  standard texts of §11.5a belong to the messages that leave the installation.

## Acceptance

```bash
npm run wp:check
npm run i18n:check
npm run lint
```

Expected: `wp:check` is green — the eight work packages of phase 36 are known to
the checker and sit inside the limits of `ctx-256k`; `i18n:check` and `lint` are
untouched by this package and stay green.

## Handoff

- Files changed: `specs/13-ui.md` (§14.13), `docs/DECISIONS/0060-…`, `docs/DECISIONS.md`,
  `PLAN.md` (§14, §16), `work-packages/README.md` (the phase and its backlog rows),
  `CHANGELOG.md`, the eight documents of `work-packages/m36/`
- Interfaces added: `HelpPopover`, `IconName` + `info`, the namespace `help`,
  `PageHelp` (planned — not implemented in this package)
- Verified: `npm run wp:check`, `npm run i18n:check`, `npm run lint`
- Follow-up WP: WP-M36-02 (the mechanism), WP-M36-03 (the settings menu entry),
  WP-M36-04 (the page-level ⓘ), WP-M36-05 … WP-M36-07 (the `title=` migration by
  surface), WP-M36-08 (the type scale and the contrast)
- Open question: none — the four open decisions of the design are answered with
  the recommendation of the review: the panel is anchored to the trigger, the
  namespace is `help`, the page help is static in the web build, the page-level
  ⓘ sits in the header next to the version.
- Notes: phase 36 may only start when the open items of the running phases are
  worked off — **WP-M34-02** (the technician who had the shift learns that his
  duty is gone) is still `planned` and **WP-M35-03** carries `status: planned`
  in its document while the backlog row says `done`.
