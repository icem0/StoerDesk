# WP-M2-92c: theme class in the shell and the light palette in styles.css

format: small-model
status: planned
depends-on: WP-M2-92b (`/me` answers `theme`), WP-M1-13/17 (shell)
phase: 2
context-budget: 16k tokens
spec: PLAN.md §14 (dark mode, theme), PLAN.md §4.1 (CSS)
spec-lines: 10

files-read:

- apps/web/src/components/Shell.tsx — `useMe()` and the shell container (WP-M1-13/17)
- apps/web/src/styles.css — `body` background and shared rules
- apps/web/src/components/__tests__/Shell.test.tsx — shell tests

files-write:

- apps/web/src/components/Shell.tsx — `theme-auto|light|dark` class on the shell container
- apps/web/src/styles.css — light palette through Tailwind v4 color variables

interfaces:

- the shell root class carries `theme-auto` when signed out or the user's theme is
  `auto`, otherwise `theme-light`/`theme-dark` from `/me`
- `styles.css` defines the light palette (inverted slate scale, light 300/400 steps of
  rose/emerald/amber/sky, `color-scheme: light`) once for `.theme-light` and, inside
  `@media (prefers-color-scheme: light)`, for `.theme-auto`; `body:has(.theme-light)`
  and the media counterpart for `.theme-auto` get the light page background
- public token pages (`/m`, `/s`) are outside the shell and keep the dark palette

## Task

1. `Shell.tsx`: shell container class list gains
   `theme-${me.data?.user.theme ?? 'auto'}` (no hardcoded user text).
2. `styles.css`: one custom-property block for the light palette; apply it to
   `.theme-light` and to `.theme-auto` under a `prefers-color-scheme: light` media
   query; add the `body:has(...)` background rules.
3. `Shell.test.tsx`: assert the `theme-auto` class without `/me` data and that a
   stubbed `theme: 'light'` yields `theme-light`.

## Non-goals

- No users-settings UI (WP-M2-92d) and no theme labels there.
- No theme on public token pages.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

## Handoff

- (filled by the implementing commit)
