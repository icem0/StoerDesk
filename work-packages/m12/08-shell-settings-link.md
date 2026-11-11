# WP-M12-08: The shell gear opens the settings page

format: small-model
status: planned
depends-on: WP-M12-07
phase: 12
context-budget: 12k tokens
spec: PLAN.md §14 user interface; specs/13-ui.md (navigation)
spec-lines: 30

files-read:

- apps/web/src/components/Shell.tsx
- apps/web/src/components/__tests__/shell.test.tsx
- apps/web/src/settings/settings-page.tsx

files-write:

- apps/web/src/components/Shell.tsx
- apps/web/src/components/__tests__/shell.test.tsx

interfaces:

- `SettingsLink` — 44 px gear link to `/settings` in the shell header
- no dropdown, no `aria-haspopup` dialog, no logout in the header

## Task

1. Remove the top-right settings dropdown from the shell: no open state, no
   click-away handler, no grouped link list and no logout inside the header.
2. Render the gear as a `NavLink` to `/settings` with the `app.settings` label,
   active styling on every settings route and the same 44 px target.
3. Replace the dropdown tests with a test that the gear is a link to
   `/settings` while the settings destinations stay off the shell page.

## Non-goals

- No change of the settings page content (WP-M12-07).
- No change of the update badge or the top-level header links.
- No new route.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npx vitest run apps/web/src/components/__tests__/shell.test.tsx
npm run wp:check
```

Expected: all green; the gear is a link, not a button, and no dialog opens.

## Handoff

- Files changed: shell header, shell test.
- Interfaces added: `SettingsLink`.
- Verified: typecheck, shell test, wp check.
- Follow-up WP: none.
- Open question: none
