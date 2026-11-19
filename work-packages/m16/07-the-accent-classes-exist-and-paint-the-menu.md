# WP-M16-07: the accent classes exist and paint the menu

format: small-model
status: done
depends-on: WP-M16-03
phase: 16
milestone: m16
context-budget: 16k tokens
spec: specs/13-ui.md §14.4; PLAN.md §14; ADR-0036
spec-lines: 60

files-read:

- apps/web/src/styles.css (the Tailwind entry, the accent ramp)
- apps/web/src/components/Shell.tsx (the accent classes of the header)
- apps/web/e2e/auth.spec.ts (the pattern of an E2E test with a session)
- apps/web/playwright.config.ts (the stack of the E2E run)

files-write:

- apps/web/src/styles.css
- apps/web/e2e/accent.spec.ts
- work-packages/README.md
- CHANGELOG.md

interfaces:

- `@theme inline` — the block that registers the colours of the accent ramp for
  Tailwind, so the utilities `*-accent-*` exist at all
- `--accent-300 … --accent-700` — the runtime ramp, declared on the theme
  classes so it sees the `--brand-accent` of the shell root
- `apps/web/e2e/accent.spec.ts` — the regression test of the accent

## Task

1. `apps/web/src/styles.css` registers the colours of the ramp in an
   `@theme inline` block: `--color-accent-300 … --color-accent-700` point at the
   runtime variables `--accent-300 … --accent-700`. Without the block Tailwind
   never generates the utilities `text-accent-300`, `bg-accent-600/10` or
   `ring-accent-400` — the classes were in the markup of WP-M16-03, but nothing
   painted them and the menu kept its blue.
2. The ramp itself moves to the theme classes (`.theme-dark`, `.theme-light`):
   the shell writes `--brand-accent` on that very element, and a custom
   property is substituted where it is declared, so the ramp has to be declared
   there to see the saved colour. `:root` keeps the default blue for the
   surfaces outside the shell.
3. The E2E test `apps/web/e2e/accent.spec.ts` saves a colour through the API of
   the branding, reloads the shell and proves that the saved value reaches
   `--brand-accent` and the ramp, and that the active entry of the menu wears
   the accent while the other entry keeps the text colour.

## Non-goals

- No change of the shell, of the menu or of the contract of the colour.
- No sweep of the primary buttons of the pages to the accent — the announced
  follow-up WP-M16-08 carries the daily surfaces, WP-M16-09 the administration.
- No change of the public report form, of the status page or of the stickers.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
npm run test:e2e
```

Expected: all green; the new E2E test fails before the change and passes after it.

## Handoff

- Files changed: `apps/web/src/styles.css`, `apps/web/e2e/accent.spec.ts`,
  `work-packages/README.md`, `CHANGELOG.md`
- Interfaces added: the `@theme inline` block, the runtime ramp `--accent-*` and
  the E2E regression test
- Verified: `npm run typecheck`, `npm run lint`, `npm run test:run`,
  `npm run wp:check`, `npm run test:e2e` with a real database and Chromium
- Follow-up WP: WP-M16-08 (the primary buttons of the daily surfaces),
  WP-M16-09 (the administration pages) — each file exists in this commit
- Open question: none
