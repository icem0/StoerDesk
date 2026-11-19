# WP-M16-03: the shell paints the accent colour of the server

format: small-model
status: done
depends-on: WP-M16-01
phase: 16
milestone: m16
context-budget: 18k tokens
spec: specs/13-ui.md §14.4; PLAN.md §14; ADR-0036
spec-lines: 60

files-read:

- apps/web/src/styles.css (the Tailwind entry, the light-theme remapping)
- apps/web/src/components/Shell.tsx (the branding request, the shell root, the menu)
- apps/web/src/settings/settings-page.tsx (the links of the settings menu)
- apps/web/src/components/__tests__/shell.test.tsx (the pattern of the shell test)
- packages/shared/src/schemas/settings.ts (`accentColor` in the branding response)

files-write:

- apps/web/src/styles.css
- apps/web/src/components/Shell.tsx
- apps/web/src/settings/settings-page.tsx
- apps/web/src/components/__tests__/shell.test.tsx

interfaces:

- `--brand-accent` — the hex colour of the branding, written on the shell root
- `--color-accent-300 … --color-accent-700` — the ramp `styles.css` derives
- the interface classes `bg-accent-*`, `border-accent-*`, `text-accent-*`,
  `ring-accent-*`

## Task

1. `apps/web/src/styles.css` declares the default `--brand-accent: #0ea5e9` on
   `:root` and derives the accent ramp `--color-accent-300`, `--color-accent-400`,
   `--color-accent-500`, `--color-accent-600`, `--color-accent-700` with
   `color-mix(in oklab, …)` from `--brand-accent`. The declarations sit on the
   theme classes of the shell root (`.theme-dark`, `.theme-light`), so the
   property the shell writes on that element feeds the ramp; the light theme
   mixes towards black for the steps that carry text.
2. `Shell.tsx` writes `--brand-accent` on its root from the branding request it
   already makes — the default while the request has no value, the saved colour
   when it has one. No second request and no new query.
3. The header and the settings menu switch from the fixed Tailwind blues to the
   accent tokens: the active menu entry, the active link of the settings menu,
   the settings gear and the focus ring keep their semantics but paint `accent`.
4. The shell test proves that the shell root carries the saved colour and that
   the active menu entry uses an accent class.

## Non-goals

- No accent on the public report form, the public status page, the dashboard
  tiles, the statistics charts or the readiness calendar — their blues carry
  semantics and stay (ADR-0036).
- No change of the notification bell — WP-M16-04 moves it.
- No new request, no new permission and no i18n text.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new assertions fail before the change and pass after it.

## Handoff

- Files changed: `apps/web/src/styles.css`, `apps/web/src/components/Shell.tsx`,
  `apps/web/src/settings/settings-page.tsx`,
  `apps/web/src/components/__tests__/shell.test.tsx`
- Interfaces added: the CSS custom property `--brand-accent` on the shell root,
  the ramp `--color-accent-300 … --color-accent-700` in `styles.css` and the
  interface classes `bg-accent-*`, `border-accent-*`, `text-accent-*`,
  `ring-accent-*`
- Verified: `npm run typecheck`, `npm run lint`, `npm run i18n:check`,
  `npm run test:run`, `npm run wp:check`, `npm run test:e2e`
- Follow-up WP: WP-M16-04, WP-M16-05 (each file exists in the commit of the split)
- Open question: none
