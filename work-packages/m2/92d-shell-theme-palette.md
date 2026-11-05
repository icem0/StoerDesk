# WP-M2-92d: theme class in the shell and the light palette in styles.css

format: small-model
status: implemented
depends-on: WP-M2-92b (`/me` answers `theme`), WP-M1-13/17 (shell)
phase: 2
context-budget: 16k tokens
spec: PLAN.md §14 (dark mode, theme, AA contrast)
spec-lines: 10

files-read:

- apps/web/src/components/Shell.tsx — `useMe()` and the shell container (WP-M1-13/17)
- apps/web/src/styles.css — `body` background and shared rules
- apps/web/src/components/__tests__/Shell.test.tsx — shell tests

files-write:

- apps/web/src/components/Shell.tsx — `theme-auto|light|dark` class on the shell container
- apps/web/src/styles.css — light palette through Tailwind v4 color variables

interfaces:

- the shell root class carries `theme-light` or `theme-dark`; the theme `auto` of
  the user (and the signed-out state) is resolved to the system preference
  `prefers-color-scheme` in the shell
- `styles.css` defines the light palette for `.theme-light`: the slate scale is
  inverted (light page, dark text), the light steps of the accent colors become dark
  enough for a light background, `color-scheme: light`; `body:has(.theme-light)` gets
  the light page background
- public token pages (`/m`, `/s`) are outside the shell and keep the dark palette

## Task

1. `Shell.tsx`: `useSystemTheme()` reads `prefers-color-scheme` (and follows a
   change of the preference); the shell container class list gains
   `theme-${theme}` with the theme of the user or the system preference.
2. `styles.css`: the custom-property block `.theme-light` with the inverted slate
   scale and the dark accent steps; `body:has(.theme-light)` gets the light page
   background.
3. `Shell.test.tsx`: the `theme-light` class for a user with `theme: 'light'` and
   for `auto` with a light system preference.

## Non-goals

- No users-settings UI (WP-M2-92e) and no theme labels there.
- No theme on public token pages.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

## Handoff

- Files changed: `apps/web/src/components/Shell.tsx`, `apps/web/src/styles.css`,
  `apps/web/src/components/__tests__/shell.test.tsx` (test)
- Interfaces added: `useSystemTheme()` in the shell, the `theme-light`/`theme-dark`
  class on the shell root, the light palette as Tailwind color variables in
  `styles.css` (no utility class changes)
- Verified: `npm run check` green — the shell tests prove the class for the theme of
  the user and for `auto` with a light system preference
- Follow-up WP: WP-M2-92e (theme select in the user settings)
- Open question: none
