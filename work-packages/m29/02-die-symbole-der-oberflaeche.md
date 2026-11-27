# WP-M29-02: the symbols of the surface

format: ctx-256k
status: done
depends-on: WP-M29-01
phase: 29
milestone: m29
context-budget: 48k tokens
spec: specs/13-ui.md §14.10; PLAN.md §14
spec-lines: 60
changed-lines: 330

files-read:

- specs/13-ui.md §14.10 (the menu of the settings)
- PLAN.md §14 (user interface)
- apps/web/src/components/Shell.tsx (the shell: header links and settings gear)
- apps/web/src/components/notification-bell.tsx (the bell of the inbox entry)

files-write:

- apps/web/src/components/icon.tsx (new)
- apps/web/src/components/__tests__/icon.test.tsx (new)
- apps/web/src/components/Shell.tsx

interfaces:

- `Icon({ name, className }): JSX.Element` — `name` is a typed union (`IconName`), every symbol is `aria-hidden` and paints `currentColor` with the feather stroke of the house (1.8 px, round joins)
- the header menu entries (Tickets, Statistik, Bereitschaft, Posteingang) and the settings gear wear a symbol

## Task

1. `apps/web/src/components/icon.tsx`: a shared `<Icon name={name} className={className} />` component. `IconName` is a union of the symbols the interface needs: `user`, `bell`, `palette`, `monitor`, `package`, `qr-code`, `users`, `shield`, `group`, `tag`, `file-text`, `alert-triangle`, `alert-circle`, `trending-up`, `sliders`, `calendar`, `refresh-cw`, `radio`, `mail`, `key`, `link`, `log-out`, `search`, `chevron-down`, `arrow-left`, `settings`, `home`, `plus`, `ticket`, `bar-chart`. Every symbol is hand-written inline SVG in the house style (`fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"`), `aria-hidden="true"`, so the link text next to it keeps the accessible name. The gear reuses the path of today's `SettingsIcon`; the bell reuses the path of today's `notification-bell.tsx`.
2. `apps/web/src/components/Shell.tsx`: every entry of the header menu gets its symbol next to its text (ticket, bar-chart, calendar, bell); the settings gear becomes `<Icon name="settings" />` and the local `SettingsIcon` disappears.
3. `apps/web/src/components/__tests__/icon.test.tsx`: every name of the union renders one `svg[aria-hidden="true"]`; the size is driven by `className`; the colour is `currentColor`.

## Non-goals

- No settings menu (WP-M29-03), no administration pages (WP-M29-04 … WP-M29-05), no channel pages (WP-M29-05).
- No new dependency: the repo keeps its hand-written inline SVGs instead of lucide/heroicons.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new test fails before the change and passes after it.

## Handoff

- Files changed: `components/icon.tsx`, `components/__tests__/icon.test.tsx`, `components/Shell.tsx`
- Interfaces added: `Icon`, `IconName`
- Verified: the commands above
- Follow-up WP: WP-M29-03 (the single-column settings menu consumes `Icon`)
- Open question: none
