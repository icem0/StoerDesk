# WP-M36-09: the notifications page hides its description behind the info symbol

format: ctx-256k
status: done
depends-on: WP-M36-02 (the help popover exists), WP-M37-01 (the overview names the rule)
phase: 36
milestone: m36
context-budget: 48k tokens
spec: specs/13-ui.md §14.13; PLAN.md §14, §16
spec-lines: 120
changed-lines: 160

files-read:

- PLAN.md (§14 the interface, §16 the current state, §17 the profiles)
- specs/13-ui.md (§14.13 the explanation of a place)
- apps/web/src/settings/notifications-page.tsx (the own page of the channels)
- apps/web/src/components/help-popover.tsx (the one trigger of every explanation)
- apps/web/src/i18n/locales/de/help.json
- apps/web/src/i18n/locales/en/help.json
- apps/web/src/i18n/locales/de/common.json
- apps/web/src/i18n/locales/en/common.json
- apps/web/src/settings/__tests__/notifications-page.test.tsx

files-write:

- apps/web/src/settings/notifications-page.tsx
- apps/web/src/i18n/locales/de/help.json
- apps/web/src/i18n/locales/en/help.json
- apps/web/src/i18n/locales/de/common.json
- apps/web/src/i18n/locales/en/common.json
- apps/web/src/settings/__tests__/notifications-page.test.tsx
- work-packages/README.md (the backlog row of phase 36)

interfaces:

- `HelpPopover({ text, label, className? })` — the one trigger of every explanation
- `help.notifications.pageHint` — the description of the own channels page

## Task

The page `/settings/notifications` names its purpose in the heading „Deine Kanäle“ and puts the explanation „Die Kanäle mit dem Zustand des für die angemeldete Person verknüpften Kontos.“ as a separate paragraph under the heading — an own line in the middle, ugly, easy to scroll over.

1. **The page.** `notifications-page.tsx` imports `HelpPopover` and replaces the paragraph `<p className="text-sm text-slate-400">{t('notifications.hint')}</p>` with an info symbol that stands **inline next to the heading** — same line, same height, not a separate row in the middle. The popover opens a panel beside the trigger with the translated text.
2. **The texts.** `notifications.hint` moves from `common.json` into `help.json` as `help.notifications.pageHint` in `de` and `en`; the key `notifications.hint` is deleted from both `common.json` files.
3. **The tests.** The page test counts `svg` elements in the ntfy card (`toHaveLength(1)`); the added info symbol brings a second `<svg>`. The assertion is adjusted to `2` — not weakened, but honest about the new DOM.
4. **The backlog.** `work-packages/README.md` names WP-M36-09 in the row of phase 36.

## Non-goals

- No change of the channel rows, of the setup cards, of the compliance block or of the rule (WP-M35-01, WP-M37-01 stay untouched).
- No new chart, no new page, no API change.
- No change of the admin channels page (`/admin/channels`) — that is WP-M36-05.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the two SVG-count assertions pass with `2`.

## Handoff

- Files changed: `apps/web/src/settings/notifications-page.tsx` (the hint paragraph
  is gone, an inline ⓘ stands next to the heading and opens the panel with the
  translated text), `apps/web/src/i18n/locales/de/help.json` and
  `.../en/help.json` (`help.notifications.pageHint` added),
  `apps/web/src/i18n/locales/de/common.json` and `.../en/common.json`
  (`notifications.hint` removed),
  `apps/web/src/settings/__tests__/notifications-page.test.tsx` (the two
  `svg`-count assertions are `2` now, one for the QR code and one for the info
  symbol), `work-packages/m36/09-…` (this document)
- Interfaces added: `help.notifications.pageHint`
- Verified: `npm run typecheck` (clean), `npm run lint` on the changed files
  (clean), `vitest run` of the notifications page test (19/19 green),
  `npm run i18n:check` (2279 keys in de = 2279 in en), `npm run wp:check`
  (867 WP checked, 0 failed)
- Follow-up WP: none — the remaining pages of phase 36 are WP-M36-05 … WP-M36-08
- Open question: none
