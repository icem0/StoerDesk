# ADR-0060: An explanation of a place is a help popover, not a hover

- Status: accepted
- Date: 2026-11-25
- Stakeholders: office, technician, administration

## Context

The interface explains itself in four unrelated ways: ~135 hint keys rendered
as visible `<p class="text-xs text-slate-500">` paragraphs, 27 native
`title=` attributes in 20 files, three `<details>/<summary>` blocks and two
`aria-describedby` paragraphs. The office asked for three things at once:
„die erklärungen sollen alle in ein mouseover gepackt werden falls sie im
menü sind“, „bei erklärungen auf einer Seite ohne einen link auf den man ein
mouseover legen kann soll ein info symbol sein … auf jeder Seite eigentlich“,
„lieber den text etwas grösser weil lesbarer“ — and the exception „es sei
 denn es ist perse eine info seite oder hilfe seite die etwas erklärt“.

Three constraints make the literal request unsafe:

- The app is a mobile-first PWA (`PLAN.md` §14, one-hand usable on a phone).
  A `title=` tooltip does not exist on a touch, cannot be opened by a
  keyboard, cannot be zoomed, cannot be translated by an assistive technology
  and closes itself on a timer. Hover-only is no contract at all.
- `PLAN.md` §14.2 requires AA contrast and touch targets of at least 44 px.
  The smallest and weakest text of the interface is today the menu
  description at `text-xs text-slate-500` — a bigger text in a colour that
  failed AA is not more readable, so size and contrast move together.
- `PLAN.md` §3.1 forbids literal strings in JSX: an explanation is always an
  i18n key, so an explanation also needs a place to be counted and translated.

## Decision

1. **One mechanism for every explanation.**
   `apps/web/src/components/help-popover.tsx`: a real `<button>` that carries
   the info symbol (`info` added to `IconName` in
   `apps/web/src/components/icon.tsx`) and toggles a panel anchored next to
   the trigger. The panel is in the DOM, not in a CSS `:hover` rule; it is
   `aria-expanded` and `aria-labelledby`, it opens on tap, on mouse, on
   keyboard focus plus `Enter` and closes on a second click, on `Escape` and
   on a click outside. It never closes on a timer. It hangs in the body of
   the document (`position: fixed`, the pattern of `row-menu.tsx`), so no
   scroll container and no sticky header clips it.
2. **Two tiers of text.** An explanation exists in two lengths in the new
   i18n namespace `help` (`apps/web/src/i18n/locales/<lng>/help.json`,
   registered in `apps/web/src/i18n/index.ts`): `help.<surface>.<item>` is
   the one-line **summary** that stays visible, `help.<surface>.<item>More`
   is the **panel body** of at most three sentences.
3. **Three surfaces consume it, no other place writes prose.**
   - the settings menu entry: symbol, label and summary stay visible; the
     panel behind the ⓘ of the entry holds the detail. The entry becomes a
     **row** — the label carries the link, the ⓘ sits beside it as a sibling.
     A `<button>` inside an `<a>` is invalid HTML and unreachable by a
     screen reader. The search matches label, summary **and** panel body.
   - the header menu: labels stay visible, no ⓘ — four entries in one row
     are named by their labels already.
   - every guarded page: the shell renders one page-level ⓘ next to the
     version, its text from `help.page.<route>`. A page that explains
     itself — a help page, an onboarding page — renders **no** page-level
     ⓘ: its own prose is the explanation.
   - fields and forms: a hint the user must know before he clicks stays
     visible; only the meaning of a value goes behind the ⓘ.
4. **Nothing that belongs to a rule moves behind a symbol.** The 112 notice
   (§2), the flow of the report form, the fixed action bar, the alarm band,
   the band of the setup warning, the badge of a mandatory channel, the
   reason beside a blocked action and the sections of the settings menu
   that never fold away (§14.10, WP-M29-03).
5. **`title=` stops being a content carrier.** The 27 sites in the product
   code migrate to the panel or to an accessible name. A `title=` may stay
   only where it repeats the accessible name of a control, never to hold an
   explanation. The SVG `<title>` of a chart keeps its desktop hover, but the
   statistics name their values in a legible list below the diagram as well
   (WP-M26-01).
6. **Readability is one lever.** `apps/web/src/styles.css` sets the root font
   size once (`font-size: 17px`), so the rem-based scale of Tailwind and every
   touch target grow together (44 px → 46.75 px, §14.2 stays satisfied). The
   11 hard `text-[10px]`/`text-[11px]` classes move to rem classes, and the
   meta text of the menu and of the hints moves one step up in size and from
   `text-slate-500` to `text-slate-300`.

## Alternatives

- **Pack the explanations into a mouse-over, as asked.** Rejected: on a phone
  there is no mouse-over, a keyboard cannot reach a `title=`, it cannot be
  zoomed and it times out. It would break §14.2.
- **The info symbol opens a hover tooltip.** Rejected for the same reason —
  the symbol is only the trigger; the panel is an openable element.
- **Everything behind the ⓘ, on every page.** Rejected: the office has to
  learn the tool; an explanation the user has to hunt for teaches nothing,
  and a rule (§2, §14.2) would sit behind a click.
- **One help page for the whole interface.** Rejected: the explanation loses
  the place it belongs to, and the office asked for the explanation „falls
  sie im menü sind“ — at the place.
- **Instance-editable page help in the standard texts.** Rejected: the help
  of a page is a fact of the build, not a fact of the instance; the standard
  texts of §11.5a belong to the messages that leave the installation.
- **A CSS `::after` tooltip driven by `data-*`.** Rejected: it cannot be
  opened, cannot be closed, wraps nothing, is not reachable by a keyboard and
  no assistive technology reads it reliably.

## Consequences

- Positive: one component, one contract, one i18n namespace; every
  explanation is translated, counted by `npm run i18n:check` and reachable by
  finger, mouse, keyboard and screen reader; the menus become scannable.
- Negative: the full text costs one click; a page with an ⓘ invites the user
  to click it before he acts.
- Negative: the settings entry must be restructured out of the wrapping
  `<a>` — an accessibility fix that was hidden under the old markup.
- Follow-up WPs: WP-M36-02 (the mechanism), WP-M36-03 (the settings menu
  entry), WP-M36-04 (the page-level ⓘ in the shell), WP-M36-05 … WP-M36-07
  (the migration of the 27 `title=` sites, split by surface), WP-M36-08
  (the type scale and the contrast), WP-M36-09 (the values of a diagram
  outside the hover).
- Blocking: the phases before 36 keep their open items first — WP-M34-02 is
  still `planned`, so phase 34 is not closed and phase 36 is only planned.
