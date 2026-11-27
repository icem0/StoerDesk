# WP-M36-07: the statistics, the objects and the notification cards name their marks in a panel

format: ctx-256k
status: done
depends-on: WP-M36-02
phase: 36
milestone: m36
context-budget: 56k tokens
spec: specs/13-ui.md §14.13; specs/12-stats.md; specs/10-notifications.md; PLAN.md §14
spec-lines: 220
changed-lines: 420

files-read:

- specs/13-ui.md (§14.13 the explanation of a place)
- specs/12-stats.md (the diagrams and their values)
- apps/web/src/components/help-popover.tsx
- apps/web/src/features/stats/stats-page.tsx
- apps/web/src/features/stats/charts.tsx
- apps/web/src/features/objects/sticker-sheet.tsx
- apps/web/src/features/settings/WebPushSubscription.tsx
- apps/web/src/features/settings/NtfySubscription.tsx
- apps/web/src/features/settings/notifications-page.tsx

files-write:

- apps/web/src/features/stats/stats-page.tsx
- apps/web/src/features/stats/charts.tsx
- apps/web/src/features/objects/sticker-sheet.tsx
- apps/web/src/features/settings/WebPushSubscription.tsx
- apps/web/src/features/settings/NtfySubscription.tsx
- apps/web/src/i18n/locales/de/help.json
- apps/web/src/i18n/locales/en/help.json

interfaces:

- `HelpPopover` replaces the `title=` of the glossary of the statistics page and of the sticker sheet
- the SVG `<title>` of a chart point stays for the mouse, the page names the values of the diagram in a **legible list below it**
- the `<details>/<summary>` blocks of the web push card fold into the panel

## Task

The last surfaces of the interface that still carry explanations in a
`title=`, in an `<details>` block or in a hover-only chart tooltip.

1. **The statistics page**: the glossary tooltips of the median, of the reaction
   time and of the ranking (`stats-page.tsx:509/515/521`) move into panels; the
   axis and the trends of WP-M26-01 stay.
2. **The diagrams name their values outside the hover**: the SVG `<title>` of a
   point stays (it belongs to the mouse), and the page adds the readable list of
   the values of the diagram below it — on a phone there is no hover, and the
   statistics must read themselves (WP-M26-01).
3. **The sticker sheet** (`sticker-sheet.tsx:69`) names its geometry in a panel;
   the **112 notice on every label stays visible and printed** (§2 — a symbol
   never replaces it).
4. **The notification cards**: the three `<details>/<summary>` blocks of the web
   push card and the tooltip of the ntfy card fold into the panel; the state of
   the channel, the badge „Pflicht“ and the count of what is missing (WP-M35-01)
   stay visible.
5. **The texts** move to `help.stats.*`, `help.objects.*` and
   `help.notifications.*` in `de` and `en`; the tests of the statistics page, of
   the sticker sheet and of the two cards prove the panels and that the 112
   notice is still in the printout.

## Non-goals

- No new chart and no new statistic.
- No change of the print geometry of the sheet (WP-M27-01 … WP-M27-06, ADR-0050).
- No change of the compliance and of the rule of the administration (WP-M35-01).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the print test still finds the 112 notice on every label.

## Handoff

- Files changed: `stats-page.tsx`, `charts.tsx`, `WebPushSubscription.tsx`, `stats.json`/`common.json`/`help.json` (de, en) and the tests
- Interfaces added: `help.stats.medianMore|averageMore|p90More`, `help.notifications.installMore|activateMore`; every diagram carries the list of its values below it (`chart-values`)
- Verified: the glossary carries no `title`, a panel opens on a tap, the three diagrams list their values, the web push card has no folding block for the two explanations; the sticker test still asserts the 112 notice on every label; typecheck of the three workspaces, `eslint .` (0 errors), the full `vitest run` against a throwaway PostgreSQL 17 (2177 of 2178 green; the one failure `web-push-esm.spec.ts` fails the same way before the change), `npm run build`, `wp:check`; `npm run i18n:check` was run with a copy of the script that splits the paths on both separators — the script itself reports 1654 phantom keys on Windows (it splits on `/`); `npm run test:e2e` was not run here (unverified)
- Follow-up WP: WP-M36-08 (the interface reads itself one step bigger)
- Open question: Left as it is: the QR code of the web push card stays in its `<details>` (it is content, not an explanation, and a popover carries text only); the SVG `<title>` of the QR codes of the sticker sheet and of the ntfy card stays — it is the accessible name of the code, the object number is printed beside it; the sticker geometry and its fonts in mm are untouched.
