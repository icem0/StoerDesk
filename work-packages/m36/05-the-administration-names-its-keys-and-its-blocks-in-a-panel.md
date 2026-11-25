# WP-M36-05: the administration names its keys and its blocks in a panel

format: ctx-256k
status: planned
depends-on: WP-M36-02
phase: 36
milestone: m36
context-budget: 56k tokens
spec: specs/13-ui.md §14.8, §14.13; PLAN.md §14
spec-lines: 200
changed-lines: 480

files-read:

- specs/13-ui.md (§14.8 the row menu, §14.13 the explanation of a place)
- docs/DECISIONS/0060-an-explanation-of-a-place-is-a-help-popover.md
- apps/web/src/components/help-popover.tsx
- apps/web/src/admin/status-page.tsx
- apps/web/src/admin/detected-errors-page.tsx
- apps/web/src/admin/text-templates-page.tsx
- apps/web/src/admin/oncall-page.tsx
- apps/web/src/admin/users-page.tsx
- apps/web/src/admin/channel-form-parts.tsx
- apps/web/src/components/row-menu.tsx

files-write:

- apps/web/src/admin/status-page.tsx
- apps/web/src/admin/detected-errors-page.tsx
- apps/web/src/admin/text-templates-page.tsx
- apps/web/src/admin/oncall-page.tsx
- apps/web/src/admin/users-page.tsx
- apps/web/src/admin/channel-form-parts.tsx
- apps/web/src/components/row-menu.tsx
- apps/web/src/i18n/locales/de/help.json
- apps/web/src/i18n/locales/en/help.json

interfaces:

- `HelpPopover` replaces every `title=` of these pages — no explanation travels in a native tooltip any more
- `help.<surface>.<item>More` — the panel of a table key, of a blocked action and of a field
- `RowMenu` keeps its `reason` for a blocked action, rendered in the panel of the row menu, not in a `title=`

## Task

The 27 native `title=` tooltips of the product code carry real explanations
today. Seven of them sit in the administration. `title=` cannot be opened on a
phone, by a keyboard or by a screen reader (§14.2), so the explanations move to
the popover of WP-M36-02.

1. **The table keys** of the statuses, the detected errors, the text templates,
   the pools and swaps of the readiness and the API keys stay readable in the
   row (§14.8: one name in the language of the interface), and the meaning of a
   key opens behind the ⓘ of the row.
2. **The reason of a blocked action** (delete blocked because the entry is
   referenced) moves into the panel of the row menu. It stays **visible next to
   the blocked action** as one line — the office needs the reason to act, so it
   is not hidden twice.
3. **The fields** of the channel form and of the users page: the hint that must
   be known before the click stays visible, the meaning of a value goes behind
   the ⓘ.
4. **The texts** move to `help.<surface>.<item>More` in `de` and `en`.
5. **The tests** of these pages keep their assertions and gain the new ones: no
   `title=` carries an explanation, the panel of the key of a detected error
   opens on tap and on keyboard, the reason of a blocked delete still names its
   reason where the row menu is closed.

## Non-goals

- No readiness calendar and no ticket surface — WP-M36-06.
- No statistics and no notification card — WP-M36-07.
- No change of the row-menu geometry (the portal, the scroll follower) — WP-M16-15, WP-M16-22 stay.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; every case of the moved tooltips that relied on `title=`
fails before the change and passes after it.

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: WP-M36-06 (the readiness and the tickets name their marks in a panel)
- Open question: none
